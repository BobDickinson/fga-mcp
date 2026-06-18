import { checkOfflineMode } from "../../guards.js";
import {
  hasScopeStore,
  isDynamicConnectionsEnabled,
  requireScopeStore,
} from "../../connection-resolver.js";
import { requirePool, type ServerContext } from "../../client.js";
import { listFixedServers, setDefaultServer as setFixedDefaultServer } from "../../server-pool.js";
import { executeConnectServer, type ConnectServerToolInput } from "../../connect-flow.js";
import type { ToolCallContext } from "../../elicitation/types.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listServersOfflineGuard(ctx: ServerContext): string | null {
  if (ctx.offline) {
    return checkOfflineMode(ctx, "Listing FGA servers");
  }
  const hasFixed = (ctx.pool?.servers.size ?? 0) > 0;
  if (hasFixed || hasScopeStore(ctx)) return null;
  return checkOfflineMode(ctx, "Listing FGA servers");
}

function listFixedServersOrEmpty(ctx: ServerContext) {
  if (!ctx.pool || ctx.pool.servers.size === 0) return [];
  return listFixedServers(ctx.pool, ctx.connectRequiredServers);
}

export async function listServers(
  ctx: ServerContext,
  connectionScope?: string,
): Promise<string | Record<string, unknown>> {
  const offline = listServersOfflineGuard(ctx);
  if (offline) return offline;

  const dynamicConnectionsEnabled = isDynamicConnectionsEnabled(ctx);
  const fixedServers = listFixedServersOrEmpty(ctx);
  const response: Record<string, unknown> = {
    dynamic_connections_enabled: dynamicConnectionsEnabled,
    servers: fixedServers,
  };

  const scope = connectionScope?.trim();
  if (!scope) return response;

  if (!hasScopeStore(ctx)) {
    return "❌ No connection scopes are available. Call connect_server first.";
  }

  try {
    const scopedServers = requireScopeStore(ctx).listServers(scope);
    response.connection_scope = scope;
    response.servers = scopedServers;
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
    if (!hasScopeStore(ctx)) {
      return "❌ No connection scopes are available.";
    }
    try {
      requireScopeStore(ctx).setDefaultServer(scope, server);
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

export type ConnectServerToolInputExport = ConnectServerToolInput;

export async function connectServer(
  ctx: ServerContext,
  input: ConnectServerToolInput,
  toolCtx?: ToolCallContext,
): Promise<string | Record<string, unknown>> {
  const result = await executeConnectServer(ctx, input, toolCtx);
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
}

export async function disconnectServer(
  ctx: ServerContext,
  connectionScope: string,
  server: string,
): Promise<string> {
  if (!hasScopeStore(ctx)) {
    return "❌ No connection scopes are available.";
  }

  if (!connectionScope?.trim()) {
    return "❌ disconnect_server requires connection_scope.";
  }

  if (!server?.trim()) {
    return "❌ disconnect_server requires server.";
  }

  try {
    requireScopeStore(ctx).disconnectServer(connectionScope.trim(), server.trim());
    return `✅ Disconnected server "${server}" from scope ${connectionScope}.`;
  } catch (error) {
    return `❌ Failed to disconnect server! Error: ${errorMessage(error)}`;
  }
}
