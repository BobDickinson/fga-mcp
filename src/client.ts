import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import {
  createFixedServerPool,
  getActiveServerPool,
  type FixedServerPool,
  resolveClient,
  type ResolveClientArgs,
} from "./server-pool.js";
import { loadFgaConfig, type FgaConfigDocument } from "./fga-config.js";
import { getConfiguredString } from "./config.js";

export type ServerContext = {
  pool: FixedServerPool | null;
  offline: boolean;
  fgaConfig: FgaConfigDocument | null;
};

export async function createServerContext(configPath?: string): Promise<ServerContext> {
  const loaded = loadFgaConfig(configPath);

  if (!loaded.ok) {
    throw new Error(loaded.errors.join("; "));
  }

  const { config } = loaded;
  const hasServers = Object.keys(config.servers ?? {}).length > 0;

  if (!hasServers) {
    logInfo("Starting OpenFGA MCP Server in OFFLINE MODE");
    logInfo("Available features: Planning (Prompts) and Coding assistance");
    logInfo("To enable administrative features, configure OPENFGA_MCP servers or OPENFGA_MCP_API_URL\n");
    return { pool: null, offline: true, fgaConfig: config };
  }

  const pool = await createFixedServerPool(config);
  logInfo("Starting OpenFGA MCP Server in ONLINE MODE");
  for (const [name, entry] of pool!.servers.entries()) {
    logInfo(`  - server "${name}": ${entry.profile.api_url}`);
  }
  if (pool!.defaultServer) {
    logInfo(`Default server: ${pool!.defaultServer}`);
  }
  logInfo("All features enabled: Planning, Coding, and Administrative\n");

  return { pool, offline: false, fgaConfig: config };
}

export function requirePool(ctx: ServerContext): FixedServerPool {
  if (!ctx.pool || ctx.pool.servers.size === 0) {
    throw new Error("OpenFGA server pool is not available in offline mode");
  }
  return ctx.pool;
}

export function requireClient(ctx: ServerContext, args: ResolveClientArgs = {}): OpenFgaClientType {
  return resolveClient(requirePool(ctx), args);
}

/** Default server's client — used by completions until scoped in Release D. */
export function defaultClient(ctx: ServerContext): OpenFgaClientType | null {
  if (!ctx.pool || ctx.pool.servers.size === 0) return null;
  try {
    return resolveClient(ctx.pool, {});
  } catch {
    return ctx.pool.servers.values().next().value?.client ?? null;
  }
}

export function isContextOffline(ctx: ServerContext): boolean {
  return ctx.offline || !ctx.pool || ctx.pool.servers.size === 0;
}

function logInfo(message: string): void {
  process.stderr.write(`[INFO] ${message}\n`);
}

export function legacyEnvHasCredentials(): boolean {
  const apiUrl = getConfiguredString("OPENFGA_MCP_API_URL", "");
  const hasToken = getConfiguredString("OPENFGA_MCP_API_TOKEN", "") !== "";
  const hasClientId = getConfiguredString("OPENFGA_MCP_API_CLIENT_ID", "") !== "";
  return apiUrl !== "" || hasToken || hasClientId;
}

export { getActiveServerPool, hasActiveFgaConnections } from "./server-pool.js";
