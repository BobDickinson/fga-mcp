import {
  CredentialsMethod,
  OpenFgaClient,
  type OpenFgaClient as OpenFgaClientType,
} from "@openfga/sdk";
import type { FgaConfigDocument, FgaDefaultsConfig, FgaServerConfig } from "./fga-config.js";

export type ServerPolicy = {
  defaultStore?: string;
  defaultModel?: string;
  restrict: boolean;
  writeable: boolean;
};

export type FixedServerEntry = {
  client: OpenFgaClientType;
  profile: FgaServerConfig & { name: string };
};

export type FixedServerPool = {
  servers: Map<string, FixedServerEntry>;
  defaultServer: string | null;
  globalDefaults: FgaDefaultsConfig;
  fgaConfig: FgaConfigDocument;
};

export type ResolveClientArgs = {
  connectionScope?: string;
  server?: string;
};

let activePool: FixedServerPool | null = null;

export function setActiveServerPool(pool: FixedServerPool | null): void {
  activePool = pool;
}

export function getActiveServerPool(): FixedServerPool | null {
  return activePool;
}

export function hasActiveFgaConnections(): boolean {
  return activePool !== null && activePool.servers.size > 0;
}

function buildCredentials(server: FgaServerConfig): ConstructorParameters<typeof OpenFgaClient>[0]["credentials"] {
  const token = server.api_token ?? "";
  const clientId = server.client_id ?? "";

  if (token !== "") {
    return {
      method: CredentialsMethod.ApiToken,
      config: { token, headerName: "Authorization", headerValuePrefix: "Bearer" },
    };
  }

  if (clientId !== "") {
    return {
      method: CredentialsMethod.ClientCredentials,
      config: {
        clientId,
        clientSecret: server.client_secret ?? "",
        apiTokenIssuer: server.issuer ?? "",
        apiAudience: server.audience ?? "",
      },
    };
  }

  return undefined;
}

export async function createOpenFgaClientForServer(server: FgaServerConfig): Promise<OpenFgaClientType> {
  const client = new OpenFgaClient({
    apiUrl: server.api_url,
    credentials: buildCredentials(server),
  });

  try {
    await client.listStores({ pageSize: 1 });
  } catch (connectionError) {
    const message = connectionError instanceof Error ? connectionError.message : String(connectionError);
    logWarning(`Could not validate OpenFGA connection to ${server.api_url}: ${message}`);
  }

  return client;
}

export async function createFixedServerPool(config: FgaConfigDocument): Promise<FixedServerPool | null> {
  const serversConfig = config.servers ?? {};
  const names = Object.keys(serversConfig);

  if (names.length === 0) {
    setActiveServerPool(null);
    return null;
  }

  const servers = new Map<string, FixedServerEntry>();
  for (const name of names) {
    const profile = serversConfig[name];
    const client = await createOpenFgaClientForServer(profile);
    servers.set(name, { client, profile: { ...profile, name } });
  }

  let defaultServer = config.default_server ?? null;
  if (!defaultServer && names.length === 1) {
    defaultServer = names[0] ?? null;
  }
  if (defaultServer && !servers.has(defaultServer)) {
    defaultServer = names[0] ?? null;
  }

  const pool: FixedServerPool = {
    servers,
    defaultServer,
    globalDefaults: config.defaults ?? {},
    fgaConfig: config,
  };

  setActiveServerPool(pool);
  return pool;
}

export function resolveServerRef(pool: FixedServerPool, server?: string): string {
  if (server && server.trim() !== "") {
    const ref = server.trim();
    if (!pool.servers.has(ref)) {
      const connected = [...pool.servers.keys()].join(", ");
      throw new Error(`Unknown server "${ref}". Connected servers: ${connected || "(none)"}.`);
    }
    return ref;
  }

  if (pool.defaultServer && pool.servers.has(pool.defaultServer)) {
    return pool.defaultServer;
  }

  if (pool.servers.size === 1) {
    return pool.servers.keys().next().value!;
  }

  throw new Error("No server specified and no default server configured. Pass server explicitly or set default_server in config.");
}

export function resolveServerPolicy(pool: FixedServerPool, serverRef: string): ServerPolicy {
  const entry = pool.servers.get(serverRef);
  if (!entry) {
    throw new Error(`Unknown server "${serverRef}"`);
  }

  const profile = entry.profile;
  const global = pool.globalDefaults;

  return {
    defaultStore: profile.default_store ?? global.default_store,
    defaultModel: profile.default_model ?? global.default_model,
    restrict: profile.restrict ?? global.restrict ?? false,
    writeable: profile.writeable ?? global.writeable ?? false,
  };
}

export function resolveStoreId(store: string | undefined, policy: ServerPolicy): string {
  const resolved = store ?? policy.defaultStore;
  if (!resolved) {
    throw new Error("store is required when no default_store is configured for this server.");
  }
  return resolved;
}

export function resolveModelId(model: string | undefined, policy: ServerPolicy): string {
  return model ?? policy.defaultModel ?? "latest";
}

export function resolveClient(pool: FixedServerPool, args: ResolveClientArgs = {}): OpenFgaClientType {
  if (args.connectionScope) {
    throw new Error("connection_scope requires ServerContext resolution via resolveConnection()");
  }

  const serverRef = resolveServerRef(pool, args.server);
  return pool.servers.get(serverRef)!.client;
}

export function setDefaultServer(pool: FixedServerPool, server: string): void {
  if (!pool.servers.has(server)) {
    throw new Error(`Unknown server "${server}"`);
  }
  pool.defaultServer = server;
}

export type ListedServer = {
  name: string;
  api_url: string;
  default: boolean;
  fixed: true;
  default_store?: string;
  default_model?: string;
  restrict: boolean;
  writeable: boolean;
};

export function listFixedServers(pool: FixedServerPool): ListedServer[] {
  return [...pool.servers.entries()].map(([name, entry]) => {
    const policy = resolveServerPolicy(pool, name);
    return {
      name,
      api_url: entry.profile.api_url,
      default: pool.defaultServer === name,
      fixed: true,
      default_store: policy.defaultStore,
      default_model: policy.defaultModel,
      restrict: policy.restrict,
      writeable: policy.writeable,
    };
  });
}

function logWarning(message: string): void {
  process.stderr.write(`[WARNING] ${message}\n`);
}

export function createTestPool(
  clients: Record<string, OpenFgaClientType>,
  options: {
    defaultServer?: string | null;
    profiles?: Record<string, FgaServerConfig>;
    globalDefaults?: FgaDefaultsConfig;
  } = {},
): FixedServerPool {
  const servers = new Map<string, FixedServerEntry>();
  for (const [name, client] of Object.entries(clients)) {
    const profile = options.profiles?.[name] ?? { api_url: `http://127.0.0.1/${name}`, name };
    servers.set(name, { client, profile: { ...profile, name } });
  }

  const names = Object.keys(clients);
  const pool: FixedServerPool = {
    servers,
    defaultServer: options.defaultServer ?? names[0] ?? null,
    globalDefaults: options.globalDefaults ?? {},
    fgaConfig: { servers: options.profiles ?? {} },
  };

  return pool;
}
