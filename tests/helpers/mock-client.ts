import type { OpenFgaClient } from "@openfga/sdk";
import type { ServerContext } from "../../src/client.js";
import type { FgaDefaultsConfig } from "../../src/fga-config.js";
import { createTestPool } from "../../src/server-pool.js";

function envPolicyOverlay(): { globalDefaults?: FgaDefaultsConfig } {
  const globalDefaults: FgaDefaultsConfig = {};
  if (process.env.OPENFGA_MCP_API_WRITEABLE === "true") globalDefaults.writeable = true;
  if (process.env.OPENFGA_MCP_API_RESTRICT === "true") globalDefaults.restrict = true;
  if (process.env.OPENFGA_MCP_API_STORE) globalDefaults.default_store = process.env.OPENFGA_MCP_API_STORE;
  if (process.env.OPENFGA_MCP_API_MODEL) globalDefaults.default_model = process.env.OPENFGA_MCP_API_MODEL;
  return Object.keys(globalDefaults).length > 0 ? { globalDefaults } : {};
}

export function createMockContext(client: Partial<OpenFgaClient>, serverName = "default"): ServerContext {
  const pool = createTestPool(
    { [serverName]: client as OpenFgaClient },
    { defaultServer: serverName, ...envPolicyOverlay() },
  );
  return {
    pool,
    offline: false,
    fgaConfig: { default_server: serverName, servers: { [serverName]: { api_url: "http://127.0.0.1:8080" } } },
  };
}

export function createOfflineContext(): ServerContext {
  return { pool: null, offline: true, fgaConfig: null };
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
    offline: false,
    fgaConfig: { default_server: pool.defaultServer ?? undefined, servers },
  };
}
