import type { OpenFgaClient } from "@openfga/sdk";
import type { ServerContext } from "../../src/client.js";
import type { FgaDefaultsConfig } from "../../src/fga-config.js";
import { DynamicScopeStore } from "../../src/dynamic-scope-store.js";
import { createTestPool } from "../../src/server-pool.js";
import { PendingElicitationStore } from "../../src/elicitation/pending-store.js";

const DEFAULT_PUBLIC_URL = "http://127.0.0.1:9090";

function envPolicyOverlay(): { globalDefaults?: FgaDefaultsConfig } {
  const globalDefaults: FgaDefaultsConfig = {};
  if (process.env.OPENFGA_MCP_API_WRITEABLE === "true") globalDefaults.writeable = true;
  if (process.env.OPENFGA_MCP_API_RESTRICT === "true") globalDefaults.restrict = true;
  if (process.env.OPENFGA_MCP_API_STORE) globalDefaults.default_store = process.env.OPENFGA_MCP_API_STORE;
  if (process.env.OPENFGA_MCP_API_MODEL) globalDefaults.default_model = process.env.OPENFGA_MCP_API_MODEL;
  return Object.keys(globalDefaults).length > 0 ? { globalDefaults } : {};
}

function baseContextFields(overrides: Partial<Pick<ServerContext, "publicUrl" | "connectRequiredServers" | "pendingElicitations">> = {}) {
  return {
    publicUrl: overrides.publicUrl ?? DEFAULT_PUBLIC_URL,
    connectRequiredServers: overrides.connectRequiredServers ?? new Set<string>(),
    pendingElicitations: overrides.pendingElicitations ?? new PendingElicitationStore(),
  };
}

export function createMockContext(client: Partial<OpenFgaClient>, serverName = "default"): ServerContext {
  const pool = createTestPool(
    { [serverName]: client as OpenFgaClient },
    { defaultServer: serverName, ...envPolicyOverlay() },
  );
  return {
    pool,
    dynamicStore: null,
    transport: "stdio",
    offline: false,
    fgaConfig: { default_server: serverName, servers: { [serverName]: { api_url: "http://127.0.0.1:8080" } } },
    ...baseContextFields(),
  };
}

export function createOfflineContext(): ServerContext {
  return {
    pool: null,
    dynamicStore: null,
    transport: "stdio",
    offline: true,
    fgaConfig: null,
    ...baseContextFields(),
  };
}

export function createMultiServerContext(
  clients: Record<string, Partial<OpenFgaClient>>,
  options: { defaultServer?: string } = {},
): ServerContext {
  const pool = createTestPool(clients as Record<string, OpenFgaClient>, {
    defaultServer: options.defaultServer ?? Object.keys(clients)[0] ?? null,
  });
  const servers = Object.fromEntries(
    Object.keys(clients).map((name) => [name, { api_url: `http://127.0.0.1/${name}` }]),
  );
  return {
    pool,
    dynamicStore: null,
    transport: "stdio",
    offline: false,
    fgaConfig: { default_server: pool.defaultServer ?? undefined, servers },
    ...baseContextFields(),
  };
}

export function createDynamicContext(
  options: {
    transport?: "stdio" | "http";
    allowDynamicConnect?: boolean;
    globalDefaults?: FgaDefaultsConfig;
    dynamicConfig?: { scope_idle_ttl_seconds?: number | null; max_servers_per_scope?: number | null; max_scopes?: number | null };
    fixedClients?: Record<string, Partial<OpenFgaClient>>;
  } = {},
): ServerContext {
  const transport = options.transport ?? "stdio";
  const allowDynamicConnect = options.allowDynamicConnect ?? true;
  const globalDefaults = options.globalDefaults ?? {};
  const pool =
    options.fixedClients && Object.keys(options.fixedClients).length > 0
      ? createTestPool(options.fixedClients as Record<string, OpenFgaClient>)
      : null;

  return {
    pool,
    dynamicStore: allowDynamicConnect
      ? new DynamicScopeStore({
          transport,
          globalDefaults,
          config: {
            scopeIdleTtlSeconds: options.dynamicConfig?.scope_idle_ttl_seconds ?? 86400,
            maxServersPerScope: options.dynamicConfig?.max_servers_per_scope ?? 10,
            maxScopes: options.dynamicConfig?.max_scopes ?? 100,
          },
        })
      : null,
    transport,
    offline: false,
    fgaConfig: {
      allow_dynamic_connections: allowDynamicConnect,
      defaults: globalDefaults,
      dynamic: options.dynamicConfig,
      servers: pool
        ? Object.fromEntries([...pool.servers.keys()].map((name) => [name, { api_url: `http://127.0.0.1/${name}` }]))
        : {},
    },
    ...baseContextFields(),
  };
}
