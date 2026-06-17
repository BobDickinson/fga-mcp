import { checkOfflineMode } from "../../guards.js";
import { isRuntimeConnectEnabled, requireDynamicStore } from "../../connection-resolver.js";
import { requirePool, type ServerContext } from "../../client.js";
import { listFixedServers, setDefaultServer as setFixedDefaultServer } from "../../server-pool.js";
import type { ConnectServerInput } from "../../dynamic-scope-store.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listServersOfflineGuard(ctx: ServerContext): string | null {
  if (ctx.offline) {
    return checkOfflineMode(ctx, "Listing FGA servers");
  }
  const hasFixed = (ctx.pool?.servers.size ?? 0) > 0;
  if (hasFixed || isRuntimeConnectEnabled(ctx)) return null;
  return checkOfflineMode(ctx, "Listing FGA servers");
}

function listFixedServersOrEmpty(ctx: ServerContext) {
  if (!ctx.pool || ctx.pool.servers.size === 0) return [];
  return listFixedServers(ctx.pool);
}

export async function listServers(
  ctx: ServerContext,
  connectionScope?: string,
): Promise<string | Record<string, unknown>> {
  const offline = listServersOfflineGuard(ctx);
  if (offline) return offline;

  const runtimeConnectEnabled = isRuntimeConnectEnabled(ctx);
  const fixedServers = listFixedServersOrEmpty(ctx);
  const response: Record<string, unknown> = {
    runtime_connect_enabled: runtimeConnectEnabled,
    servers: fixedServers,
  };

  const scope = connectionScope?.trim();
  if (!scope) return response;

  if (!runtimeConnectEnabled) {
    return "❌ Runtime connect is disabled. Use fixed servers or set allow_runtime_connect: true in FGA config.";
  }

  try {
    const dynamicServers = requireDynamicStore(ctx).listServers(scope);
    response.connection_scope = scope;
    response.servers = [...fixedServers, ...dynamicServers];
    return response;
  } catch (error) {
    return `❌ ${errorMessage(error)}`;
  }
}

export async function setDefaultServerTool(
  ctx: ServerContext,
  server: string,
  connectionScope?: string,
): Promise<string> {
  const scope = connectionScope?.trim();
  if (scope) {
    if (!isRuntimeConnectEnabled(ctx)) {
      return "❌ Runtime connect is disabled. Use fixed servers or set allow_runtime_connect: true in FGA config.";
    }
    try {
      requireDynamicStore(ctx).setDefaultServer(scope, server);
      return `✅ Default server set to "${server}" in connection scope ${scope}.`;
    } catch (error) {
      return `❌ Failed to set default server! Error: ${errorMessage(error)}`;
    }
  }

  const offline = checkOfflineMode(ctx, "Setting default server");
  if (offline) return offline;

  try {
    const pool = requirePool(ctx);
    setFixedDefaultServer(pool, server);
    return `✅ Default server set to "${server}".`;
  } catch (error) {
    return `❌ Failed to set default server! Error: ${errorMessage(error)}`;
  }
}

export type ConnectServerToolInput = {
  connection_scope?: string;
  requested_name?: string;
  api_url: string;
  api_token?: string;
  client_id?: string;
  client_secret?: string;
  issuer?: string;
  audience?: string;
  label?: string;
  default_store?: string;
  default_model?: string;
  restrict?: boolean;
  writeable?: boolean;
};

export async function connectServer(
  ctx: ServerContext,
  input: ConnectServerToolInput,
): Promise<string | Record<string, unknown>> {
  if (!isRuntimeConnectEnabled(ctx)) {
    return "❌ Runtime connect is disabled. Use fixed servers or set allow_runtime_connect: true in FGA config.";
  }

  if (!input.api_url?.trim()) {
    return "❌ connect_server requires api_url.";
  }

  const payload: ConnectServerInput = {
    connectionScope: input.connection_scope,
    requestedName: input.requested_name,
    apiUrl: input.api_url,
    apiToken: input.api_token,
    clientId: input.client_id,
    clientSecret: input.client_secret,
    issuer: input.issuer,
    audience: input.audience,
    label: input.label,
    defaultStore: input.default_store,
    defaultModel: input.default_model,
    restrict: input.restrict,
    writeable: input.writeable,
  };

  try {
    const result = await requireDynamicStore(ctx).connectServer(payload);
    const response: Record<string, unknown> = {
      connection_scope: result.connectionScope,
      server: result.server,
      renamed: result.renamed,
      connected: result.connected,
      api_url: result.apiUrl,
    };
    if (result.requestedName !== undefined) {
      response.requested_name = result.requestedName;
    }
    return response;
  } catch (error) {
    return `❌ Failed to connect server! Error: ${errorMessage(error)}`;
  }
}

export async function disconnectServer(
  ctx: ServerContext,
  connectionScope: string,
  server: string,
): Promise<string> {
  if (!isRuntimeConnectEnabled(ctx)) {
    return "❌ Runtime connect is disabled. Use fixed servers or set allow_runtime_connect: true in FGA config.";
  }

  if (!connectionScope?.trim()) {
    return "❌ disconnect_server requires connection_scope.";
  }

  if (!server?.trim()) {
    return "❌ disconnect_server requires server.";
  }

  try {
    requireDynamicStore(ctx).disconnectServer(connectionScope.trim(), server.trim());
    return `✅ Disconnected server "${server}" from scope ${connectionScope}.`;
  } catch (error) {
    return `❌ Failed to disconnect server! Error: ${errorMessage(error)}`;
  }
}
