import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import type { DynamicScopeStore } from "./dynamic-scope-store.js";
import type { ServerContext } from "./client.js";
import {
  resolveClient as resolveFixedClient,
  resolveModelId,
  resolveServerPolicy,
  resolveServerRef,
  resolveStoreId,
  type FixedServerPool,
  type ResolveClientArgs,
  type ServerPolicy,
} from "./server-pool.js";

export type ResolvedConnection = {
  client: OpenFgaClientType;
  serverRef: string;
  apiUrl: string;
  policy: ServerPolicy;
  connectionScope?: string;
  dynamic: boolean;
  scoped: boolean;
};

export function isDynamicConnectionsEnabled(ctx: ServerContext): boolean {
  return ctx.dynamicStore !== null && (ctx.fgaConfig?.allow_dynamic_connections ?? false);
}

/** @deprecated use isDynamicConnectionsEnabled */
export const isRuntimeConnectEnabled = isDynamicConnectionsEnabled;

export function hasScopeStore(ctx: ServerContext): boolean {
  return ctx.dynamicStore !== null;
}

export function requireScopeStore(ctx: ServerContext): DynamicScopeStore {
  if (!ctx.dynamicStore) {
    throw new Error("Connection scope store is not available.");
  }
  return ctx.dynamicStore;
}

/** @deprecated use requireScopeStore when fixed scoped or dynamic scopes are enabled */
export function requireDynamicStore(ctx: ServerContext): DynamicScopeStore {
  return requireScopeStore(ctx);
}

function resolveDynamicConnection(
  ctx: ServerContext,
  scopeId: string,
  server?: string,
): ResolvedConnection {
  const store = requireScopeStore(ctx);
  const serverRef = store.resolveServerRef(scopeId, server);
  const profile = store.getServerProfile(scopeId, serverRef);
  const apiUrl = profile?.api_url ?? "";
  return {
    client: store.resolveClient(scopeId, serverRef),
    serverRef,
    apiUrl,
    policy: store.resolveServerPolicy(scopeId, serverRef),
    connectionScope: scopeId,
    dynamic: profile?.fixed_scoped !== true,
    scoped: true,
  };
}

function resolveFixedConnection(pool: FixedServerPool, server?: string): ResolvedConnection {
  const serverRef = resolveServerRef(pool, server);
  const entry = pool.servers.get(serverRef)!;
  return {
    client: resolveFixedClient(pool, { server: serverRef }),
    serverRef,
    apiUrl: entry.profile.api_url,
    policy: resolveServerPolicy(pool, serverRef),
    dynamic: false,
    scoped: false,
  };
}

function serverInScope(store: DynamicScopeStore, scopeId: string, server: string): boolean {
  try {
    store.resolveServerRef(scopeId, server);
    return true;
  } catch {
    return false;
  }
}

function findDynamicScopeForServer(ctx: ServerContext, server: string): string | undefined {
  const store = ctx.dynamicStore;
  if (!store) return undefined;

  if (ctx.transport === "stdio") {
    const single = store.getSingleScopeId();
    if (single && serverInScope(store, single, server)) return single;
    return undefined;
  }

  for (const scopeId of store.listScopeIds()) {
    if (serverInScope(store, scopeId, server)) return scopeId;
  }
  return undefined;
}

function assertNotConnectRequired(ctx: ServerContext, serverRef: string): void {
  if (ctx.transport === "http" && ctx.connectRequiredServers.has(serverRef)) {
    throw new Error(
      `Server "${serverRef}" requires authentication. Call connect_server({ server: "${serverRef}" }) first, then pass connection_scope on FGA tools.`,
    );
  }
}

export function resolveConnection(ctx: ServerContext, args: ResolveClientArgs = {}): ResolvedConnection {
  const store = ctx.dynamicStore;
  const explicitScope = args.connectionScope?.trim();

  if (explicitScope) {
    const scopeId = requireScopeStore(ctx).requireScopeForDynamicTier(explicitScope);
    return resolveDynamicConnection(ctx, scopeId, args.server);
  }

  const stdioImplicitScope =
    store && ctx.transport === "stdio" && store.getScopeCount() === 1 ? store.getSingleScopeId() ?? undefined : undefined;

  if (stdioImplicitScope && args.server && store && serverInScope(store, stdioImplicitScope, args.server)) {
    return resolveDynamicConnection(ctx, stdioImplicitScope, args.server);
  }

  const hasFixed = ctx.pool !== null && ctx.pool.servers.size > 0;

  if (hasFixed && args.server?.trim()) {
    assertNotConnectRequired(ctx, args.server.trim());
  } else if (hasFixed && !args.server && ctx.pool!.servers.size === 1) {
    const onlyServer = ctx.pool!.servers.keys().next().value!;
    assertNotConnectRequired(ctx, onlyServer);
  }

  if (hasFixed) {
    try {
      const resolved = resolveFixedConnection(ctx.pool!, args.server);
      if (args.server && store && ctx.transport === "http" && findDynamicScopeForServer(ctx, args.server)) {
        throw new Error("connection_scope is required for scoped servers on HTTP. Call connect_server first.");
      }
      return resolved;
    } catch (fixedError) {
      if (args.server && store && ctx.transport === "http" && findDynamicScopeForServer(ctx, args.server)) {
        throw new Error("connection_scope is required for scoped servers on HTTP. Call connect_server first.");
      }
      throw fixedError;
    }
  }

  if (stdioImplicitScope) {
    return resolveDynamicConnection(ctx, stdioImplicitScope, args.server);
  }

  throw new Error("OpenFGA server pool is not available. Configure fixed servers or use connect_server.");
}

export type AdminResolveInput = {
  connectionScope?: string;
  server?: string;
  store?: string;
  model?: string;
  requireStore?: boolean;
};

export function resolveAdminConnection(ctx: ServerContext, input: AdminResolveInput = {}): ResolvedConnection & {
  store?: string;
  model?: string;
} {
  const connection = resolveConnection(ctx, {
    connectionScope: input.connectionScope,
    server: input.server,
  });

  const result: ResolvedConnection & { store?: string; model?: string } = { ...connection };

  if (input.requireStore !== false) {
    result.store = resolveStoreId(input.store, connection.policy);
  }

  if (input.model !== undefined || input.store !== undefined || connection.policy.defaultModel) {
    result.model = resolveModelId(input.model, connection.policy);
  }

  return result;
}
