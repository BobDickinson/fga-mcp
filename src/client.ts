import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import {
  createFixedServerPool,
  getActiveServerPool,
  type FixedServerPool,
  resolveClient,
  type ResolveClientArgs,
} from "./server-pool.js";
import { DynamicScopeStore, resolveDynamicConfig } from "./dynamic-scope-store.js";
import { loadFgaConfig, type FgaConfigDocument } from "./fga-config.js";
import { getConfiguredString } from "./config.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { resolveConnection } from "./connection-resolver.js";
import { probeOpenFgaAuth } from "./auth-probe.js";
import { PendingElicitationStore } from "./elicitation/pending-store.js";
import { buildPublicUrl } from "./elicitation/public-url.js";

export type ServerContext = {
  pool: FixedServerPool | null;
  dynamicStore: DynamicScopeStore | null;
  transport: "stdio" | "http";
  offline: boolean;
  fgaConfig: FgaConfigDocument | null;
  publicUrl: string;
  connectRequiredServers: Set<string>;
  pendingElicitations: PendingElicitationStore;
};

export async function createServerContext(
  configPath?: string,
  runtime: Pick<RuntimeConfig, "transport" | "host" | "port" | "publicUrl"> = {
    transport: "stdio",
    host: "127.0.0.1",
    port: 9090,
  },
): Promise<ServerContext> {
  const loaded = loadFgaConfig(configPath);

  if (!loaded.ok) {
    throw new Error(loaded.errors.join("; "));
  }

  const { config } = loaded;
  const hasFixedServers = Object.keys(config.servers ?? {}).length > 0;
  const allowDynamicConnections = config.allow_dynamic_connections ?? false;
  const publicUrl = buildPublicUrl({
    publicUrl: runtime.publicUrl,
    bindHost: runtime.host,
    port: runtime.port,
  });
  const pendingElicitations = new PendingElicitationStore();
  const connectRequiredServers = new Set<string>();

  if (!hasFixedServers && !allowDynamicConnections) {
    logInfo("Starting OpenFGA MCP Server in OFFLINE MODE");
    logInfo("Available features: Planning (Prompts) and Coding assistance");
    logInfo("To enable administrative features, configure OPENFGA_MCP servers or OPENFGA_MCP_API_URL\n");
    return {
      pool: null,
      dynamicStore: null,
      transport: runtime.transport,
      offline: true,
      fgaConfig: config,
      publicUrl,
      connectRequiredServers,
      pendingElicitations,
    };
  }

  const pool = hasFixedServers ? await createFixedServerPool(config) : null;

  if (pool && runtime.transport === "http") {
    for (const [name, entry] of pool.servers.entries()) {
      if (entry.profile.auth) continue;
      const probe = await probeOpenFgaAuth(entry.profile.api_url);
      if (probe.status === "auth_required") {
        connectRequiredServers.add(name);
      } else if (probe.status === "error") {
        logWarning(`Auth probe for fixed server "${name}": ${probe.message}`);
      }
    }
  } else if (pool && runtime.transport === "stdio") {
    for (const [name, entry] of pool.servers.entries()) {
      if (!entry.profile.auth) {
        const probe = await probeOpenFgaAuth(entry.profile.api_url);
        if (probe.status === "auth_required") {
          connectRequiredServers.add(name);
        }
      }
    }
  }

  const needsScopedConnect = connectRequiredServers.size > 0;
  const dynamicStore =
    allowDynamicConnections || needsScopedConnect
      ? new DynamicScopeStore({
          transport: runtime.transport,
          globalDefaults: config.defaults ?? {},
          config: resolveDynamicConfig(config.dynamic),
        })
      : null;

  logInfo("Starting OpenFGA MCP Server in ONLINE MODE");
  if (pool) {
    for (const [name, entry] of pool.servers.entries()) {
      logInfo(`  - fixed server "${name}": ${entry.profile.api_url}`);
    }
    if (pool.defaultServer) {
      logInfo(`Default fixed server: ${pool.defaultServer}`);
    }
  }
  if (allowDynamicConnections) {
    logInfo(`Dynamic connections enabled (${runtime.transport} transport)`);
  }
  logInfo("All features enabled: Planning, Coding, and Administrative\n");

  return { pool, dynamicStore, transport: runtime.transport, offline: false, fgaConfig: config, publicUrl, connectRequiredServers, pendingElicitations };
}

export function requirePool(ctx: ServerContext): FixedServerPool {
  if (!ctx.pool || ctx.pool.servers.size === 0) {
    throw new Error("OpenFGA fixed server pool is not available");
  }
  return ctx.pool;
}

export function requireClient(ctx: ServerContext, args: ResolveClientArgs = {}): OpenFgaClientType {
  return resolveConnection(ctx, args).client;
}

/** Default server's client — used by completions until scoped in Release D. */
export function defaultClient(ctx: ServerContext): OpenFgaClientType | null {
  if (ctx.pool && ctx.pool.servers.size > 0) {
    try {
      return resolveClient(ctx.pool, {});
    } catch {
      return ctx.pool.servers.values().next().value?.client ?? null;
    }
  }

  const scopeId = ctx.dynamicStore?.getSingleScopeId();
  if (scopeId && ctx.dynamicStore) {
    try {
      return ctx.dynamicStore.resolveClient(scopeId);
    } catch {
      return null;
    }
  }

  return null;
}

export function isContextOffline(ctx: ServerContext): boolean {
  if (ctx.offline) return true;
  const hasFixed = ctx.pool !== null && ctx.pool.servers.size > 0;
  const hasDynamic = ctx.dynamicStore !== null && ctx.dynamicStore.getScopeCount() > 0;
  return !hasFixed && !hasDynamic;
}

export function disposeServerContext(ctx: ServerContext): void {
  ctx.dynamicStore?.dispose();
}

function logInfo(message: string): void {
  process.stderr.write(`[INFO] ${message}\n`);
}

function logWarning(message: string): void {
  process.stderr.write(`[WARNING] ${message}\n`);
}

export function legacyEnvHasCredentials(): boolean {
  const apiUrl = getConfiguredString("OPENFGA_MCP_API_URL", "");
  const hasToken = getConfiguredString("OPENFGA_MCP_API_TOKEN", "") !== "";
  const hasClientId = getConfiguredString("OPENFGA_MCP_API_CLIENT_ID", "") !== "";
  return apiUrl !== "" || hasToken || hasClientId;
}

export { getActiveServerPool, hasActiveFgaConnections } from "./server-pool.js";
