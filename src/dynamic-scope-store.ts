import { randomUUID } from "node:crypto";
import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import { buildServerAuth, type FgaDefaultsConfig, type FgaDynamicConfig, type FgaServerConfig } from "./fga-config.js";
import {
  createOpenFgaClientForServer,
  resolveModelId,
  resolveServerPolicy as resolveFixedServerPolicy,
  resolveStoreId,
  type ServerPolicy,
} from "./server-pool.js";

export type DynamicServerEntry = {
  client: OpenFgaClientType;
  profile: FgaServerConfig & { name: string };
};

export type ScopeRegistry = {
  scopeId: string;
  servers: Map<string, DynamicServerEntry>;
  defaultServer: string | null;
  createdAt: number;
  lastUsedAt: number;
};

export type ResolvedDynamicConfig = {
  scopeIdleTtlSeconds: number | null;
  maxServersPerScope: number | null;
  maxScopes: number | null;
};

export const DEFAULT_DYNAMIC_CONFIG: ResolvedDynamicConfig = {
  scopeIdleTtlSeconds: 86400,
  maxServersPerScope: 10,
  maxScopes: 100,
};

export type DynamicScopeStoreOptions = {
  transport: "stdio" | "http";
  globalDefaults: FgaDefaultsConfig;
  config: ResolvedDynamicConfig;
};

export type ConnectServerInput = {
  connectionScope?: string;
  requestedName?: string;
  apiUrl: string;
  apiToken?: string;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  audience?: string;
  scopes?: string;
  label?: string;
  defaultStore?: string;
  defaultModel?: string;
  restrict?: boolean;
  writeable?: boolean;
};

export type ConnectServerResult = {
  connectionScope: string;
  server: string;
  requestedName?: string;
  renamed: boolean;
  connected: boolean;
  apiUrl: string;
};

export type ListedDynamicServer = {
  name: string;
  api_url: string;
  default: boolean;
  fixed: false;
  default_store?: string;
  default_model?: string;
  restrict: boolean;
  writeable: boolean;
};

export function resolveDynamicConfig(raw?: FgaDynamicConfig | null): ResolvedDynamicConfig {
  return {
    scopeIdleTtlSeconds: raw?.scope_idle_ttl_seconds ?? DEFAULT_DYNAMIC_CONFIG.scopeIdleTtlSeconds,
    maxServersPerScope: raw?.max_servers_per_scope ?? DEFAULT_DYNAMIC_CONFIG.maxServersPerScope,
    maxScopes: raw?.max_scopes ?? DEFAULT_DYNAMIC_CONFIG.maxScopes,
  };
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, "").toLowerCase();
}

export function deriveServerNameFromUrl(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl);
    let host = parsed.hostname.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (host === "" || host === "localhost" || host === "127-0-0-1") {
      host = `local-${parsed.port || "8080"}`;
    }
    return host.toLowerCase();
  } catch {
    return "server";
  }
}

export function assignServerName(
  registry: ScopeRegistry,
  requestedName: string | undefined,
  apiUrl: string,
): { name: string; renamed: boolean; requestedName?: string } {
  const normalizedUrl = normalizeApiUrl(apiUrl);

  for (const [name, entry] of registry.servers.entries()) {
    if (normalizeApiUrl(entry.profile.api_url) === normalizedUrl) {
      return { name, renamed: false, requestedName: requestedName?.trim() || undefined };
    }
  }

  const base = requestedName?.trim() || deriveServerNameFromUrl(apiUrl);
  if (!registry.servers.has(base)) {
    return { name: base, renamed: requestedName !== undefined && base !== requestedName.trim(), requestedName: requestedName?.trim() };
  }

  let suffix = 1;
  while (registry.servers.has(`${base}-${suffix}`)) suffix += 1;
  const assigned = `${base}-${suffix}`;
  return {
    name: assigned,
    renamed: true,
    requestedName: requestedName?.trim(),
  };
}

export class DynamicScopeStore {
  readonly transport: "stdio" | "http";
  readonly globalDefaults: FgaDefaultsConfig;
  readonly config: ResolvedDynamicConfig;
  private scopes = new Map<string, ScopeRegistry>();
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DynamicScopeStoreOptions) {
    this.transport = options.transport;
    this.globalDefaults = options.globalDefaults;
    this.config = options.config;

    if (this.transport === "http" && this.config.scopeIdleTtlSeconds !== null) {
      this.evictionTimer = setInterval(() => this.evictIdleScopes(), 60_000);
      if (typeof this.evictionTimer.unref === "function") this.evictionTimer.unref();
    }
  }

  dispose(): void {
    if (this.evictionTimer) clearInterval(this.evictionTimer);
    for (const scope of this.scopes.values()) {
      for (const entry of scope.servers.values()) {
        void entry.client;
      }
    }
    this.scopes.clear();
  }

  getScopeCount(): number {
    return this.scopes.size;
  }

  getSingleScopeId(): string | null {
    if (this.scopes.size !== 1) return null;
    return this.scopes.keys().next().value ?? null;
  }

  listScopeIds(): string[] {
    return [...this.scopes.keys()];
  }

  hasScope(scopeId: string): boolean {
    return this.scopes.has(scopeId);
  }

  touchScope(scopeId: string): void {
    const scope = this.scopes.get(scopeId);
    if (scope) scope.lastUsedAt = Date.now();
  }

  evictIdleScopes(now = Date.now()): string[] {
    const ttl = this.config.scopeIdleTtlSeconds;
    if (ttl === null || this.transport !== "http") return [];

    const evicted: string[] = [];
    for (const [scopeId, scope] of this.scopes.entries()) {
      if (now - scope.lastUsedAt > ttl * 1000) {
        this.scopes.delete(scopeId);
        evicted.push(scopeId);
      }
    }
    return evicted;
  }

  resolveEffectiveScope(connectionScope?: string): string | undefined {
    if (connectionScope && connectionScope.trim() !== "") return connectionScope.trim();
    if (this.transport === "stdio" && this.scopes.size === 1) {
      return this.getSingleScopeId() ?? undefined;
    }
    return undefined;
  }

  requireScopeForDynamicTier(connectionScope?: string): string {
    const effective = this.resolveEffectiveScope(connectionScope);
    if (!effective) {
      if (this.transport === "http") {
        throw new Error("connection_scope is required for dynamic servers on HTTP. Call connect_server first.");
      }
      throw new Error("connection_scope is required. Call connect_server first.");
    }
    if (!this.scopes.has(effective)) {
      throw new Error(
        `Unknown connection_scope "${effective}". Call connect_server to create a dynamic session (scope may have expired or been dropped after last disconnect).`,
      );
    }
    this.touchScope(effective);
    this.evictIdleScopes();
    return effective;
  }

  mintScope(): string {
    if (this.transport === "stdio" && this.scopes.size >= 1) {
      throw new Error("At most one dynamic connection scope is allowed on stdio transport.");
    }

    const maxScopes = this.config.maxScopes;
    if (this.transport === "http" && maxScopes !== null && this.scopes.size >= maxScopes) {
      throw new Error(
        `Maximum connection scopes (${maxScopes}) reached. Disconnect unused scopes or set dynamic.max_scopes in config.`,
      );
    }

    const scopeId = randomUUID();
    const now = Date.now();
    this.scopes.set(scopeId, {
      scopeId,
      servers: new Map(),
      defaultServer: null,
      createdAt: now,
      lastUsedAt: now,
    });
    return scopeId;
  }

  resolveScopeForConnect(connectionScope?: string): string {
    if (connectionScope && connectionScope.trim() !== "") {
      const scopeId = connectionScope.trim();
      if (!this.scopes.has(scopeId)) {
        throw new Error(
          `Unknown connection_scope "${scopeId}". Call connect_server to create a dynamic session (scope may have expired or been dropped after last disconnect).`,
        );
      }
      this.touchScope(scopeId);
      return scopeId;
    }

    if (this.transport === "stdio" && this.scopes.size === 1) {
      const scopeId = this.getSingleScopeId()!;
      this.touchScope(scopeId);
      return scopeId;
    }

    return this.mintScope();
  }

  async connectServer(input: ConnectServerInput): Promise<ConnectServerResult> {
    const scopeId = this.resolveScopeForConnect(input.connectionScope);
    const registry = this.scopes.get(scopeId)!;

    const maxServers = this.config.maxServersPerScope;
    const normalizedUrl = normalizeApiUrl(input.apiUrl);
    const existingByUrl = [...registry.servers.entries()].find(
      ([, entry]) => normalizeApiUrl(entry.profile.api_url) === normalizedUrl,
    );

    if (!existingByUrl && maxServers !== null && registry.servers.size >= maxServers) {
      throw new Error(
        `Maximum servers per connection scope (${maxServers}) reached. Disconnect unused servers or set dynamic.max_servers_per_scope in config.`,
      );
    }

    const assignment = assignServerName(registry, input.requestedName, input.apiUrl);
    const auth = buildServerAuth({
      apiToken: input.apiToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      issuer: input.issuer,
      audience: input.audience,
      scopes: input.scopes,
    });

    const profile: FgaServerConfig & { name: string } = {
      name: assignment.name,
      api_url: input.apiUrl.trim(),
      auth,
      label: input.label,
      default_store: input.defaultStore,
      default_model: input.defaultModel,
      restrict: input.restrict,
      writeable: input.writeable,
    };

    const client = await createOpenFgaClientForServer(profile);

    if (existingByUrl) {
      registry.servers.set(existingByUrl[0], { client, profile: { ...profile, name: existingByUrl[0] } });
      registry.lastUsedAt = Date.now();
      return {
        connectionScope: scopeId,
        server: existingByUrl[0],
        requestedName: input.requestedName?.trim(),
        renamed: false,
        connected: true,
        apiUrl: input.apiUrl.trim(),
      };
    }

    registry.servers.set(assignment.name, { client, profile });
    if (!registry.defaultServer || registry.servers.size === 1) {
      registry.defaultServer = assignment.name;
    }
    registry.lastUsedAt = Date.now();

    return {
      connectionScope: scopeId,
      server: assignment.name,
      requestedName: assignment.requestedName,
      renamed: assignment.renamed,
      connected: true,
      apiUrl: input.apiUrl.trim(),
    };
  }

  disconnectServer(connectionScope: string, server: string): void {
    const scopeId = this.requireScopeForDynamicTier(connectionScope);
    const registry = this.scopes.get(scopeId)!;
    const ref = server.trim();
    if (!registry.servers.has(ref)) {
      throw new Error(`Unknown server "${ref}" in connection scope "${scopeId}".`);
    }

    registry.servers.delete(ref);
    if (registry.defaultServer === ref) {
      registry.defaultServer = registry.servers.size === 1 ? registry.servers.keys().next().value ?? null : registry.servers.keys().next().value ?? null;
    }

    if (registry.servers.size === 0) {
      this.scopes.delete(scopeId);
      return;
    }

    if (registry.defaultServer && !registry.servers.has(registry.defaultServer)) {
      registry.defaultServer = registry.servers.keys().next().value ?? null;
    }
    registry.lastUsedAt = Date.now();
  }

  setDefaultServer(connectionScope: string, server: string): void {
    const scopeId = this.requireScopeForDynamicTier(connectionScope);
    const registry = this.scopes.get(scopeId)!;
    const ref = server.trim();
    if (!registry.servers.has(ref)) {
      throw new Error(`Unknown server "${ref}" in connection scope "${scopeId}".`);
    }
    registry.defaultServer = ref;
    registry.lastUsedAt = Date.now();
  }

  listServers(connectionScope: string): ListedDynamicServer[] {
    const scopeId = this.requireScopeForDynamicTier(connectionScope);
    const registry = this.scopes.get(scopeId)!;
    return [...registry.servers.entries()].map(([name, entry]) => {
      const policy = this.resolveServerPolicy(scopeId, name);
      return {
        name,
        api_url: entry.profile.api_url,
        default: registry.defaultServer === name,
        fixed: false as const,
        default_store: policy.defaultStore,
        default_model: policy.defaultModel,
        restrict: policy.restrict,
        writeable: policy.writeable,
      };
    });
  }

  resolveServerRef(scopeId: string, server?: string): string {
    const registry = this.scopes.get(scopeId);
    if (!registry) {
      throw new Error(
        `Unknown connection_scope "${scopeId}". Call connect_server to create a dynamic session (scope may have expired or been dropped after last disconnect).`,
      );
    }

    if (server && server.trim() !== "") {
      const ref = server.trim();
      if (!registry.servers.has(ref)) {
        const connected = [...registry.servers.keys()].join(", ");
        throw new Error(`Unknown server "${ref}". Connected servers: ${connected || "(none)"}.`);
      }
      return ref;
    }

    if (registry.defaultServer && registry.servers.has(registry.defaultServer)) {
      return registry.defaultServer;
    }

    if (registry.servers.size === 1) {
      return registry.servers.keys().next().value!;
    }

    throw new Error("No server specified and no default server configured. Pass server explicitly or call set_default_server.");
  }

  resolveServerPolicy(scopeId: string, serverRef: string): ServerPolicy {
    const registry = this.scopes.get(scopeId);
    const entry = registry?.servers.get(serverRef);
    if (!entry) {
      throw new Error(`Unknown server "${serverRef}"`);
    }

    const profile = entry.profile;
    const global = this.globalDefaults;

    return {
      defaultStore: profile.default_store ?? global.default_store,
      defaultModel: profile.default_model ?? global.default_model,
      restrict: profile.restrict ?? global.restrict ?? false,
      writeable: profile.writeable ?? global.writeable ?? false,
    };
  }

  resolveClient(scopeId: string, server?: string): OpenFgaClientType {
    this.touchScope(scopeId);
    this.evictIdleScopes();
    const serverRef = this.resolveServerRef(scopeId, server);
    return this.scopes.get(scopeId)!.servers.get(serverRef)!.client;
  }

  resolveStoreIdForServer(scopeId: string, serverRef: string, store?: string): string {
    return resolveStoreId(store, this.resolveServerPolicy(scopeId, serverRef));
  }

  resolveModelIdForServer(scopeId: string, serverRef: string, model?: string): string {
    return resolveModelId(model, this.resolveServerPolicy(scopeId, serverRef));
  }
}

export { resolveStoreId, resolveModelId, resolveFixedServerPolicy as resolvePolicyFromProfile };
