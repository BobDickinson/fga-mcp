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
  policy: ServerPolicy;
  connectionScope?: string;
  dynamic: boolean;
};

export function isRuntimeConnectEnabled(ctx: ServerContext): boolean {
  return ctx.dynamicStore !== null && (ctx.fgaConfig?.allow_runtime_connect ?? false);
}

export function requireDynamicStore(ctx: ServerContext): DynamicScopeStore {
  if (!ctx.dynamicStore) {
    throw new Error("Runtime connect is disabled. Use fixed servers or set allow_runtime_connect: true in FGA config.");
  }
  return ctx.dynamicStore;
}

function resolveDynamicConnection(
  ctx: ServerContext,
  scopeId: string,
  server?: string,
): ResolvedConnection {
  const store = requireDynamicStore(ctx);
  const serverRef = store.resolveServerRef(scopeId, server);
  return {
    client: store.resolveClient(scopeId, serverRef),
    serverRef,
    policy: store.resolveServerPolicy(scopeId, serverRef),
    connectionScope: scopeId,
    dynamic: true,
  };
}

function resolveFixedConnection(pool: FixedServerPool, server?: string): ResolvedConnection {
  const serverRef = resolveServerRef(pool, server);
  return {
    client: resolveFixedClient(pool, { server: serverRef }),
    serverRef,
    policy: resolveServerPolicy(pool, serverRef),
    dynamic: false,
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

export function resolveConnection(ctx: ServerContext, args: ResolveClientArgs = {}): ResolvedConnection {
  const store = ctx.dynamicStore;
  const explicitScope = args.connectionScope?.trim();

  if (explicitScope) {
    const scopeId = requireDynamicStore(ctx).requireScopeForDynamicTier(explicitScope);
    return resolveDynamicConnection(ctx, scopeId, args.server);
  }

  const stdioImplicitScope =
    store && ctx.transport === "stdio" && store.getScopeCount() === 1 ? store.getSingleScopeId() ?? undefined : undefined;

  if (stdioImplicitScope && args.server && store && serverInScope(store, stdioImplicitScope, args.server)) {
    return resolveDynamicConnection(ctx, stdioImplicitScope, args.server);
  }

  const hasFixed = ctx.pool !== null && ctx.pool.servers.size > 0;

  if (hasFixed) {
    try {
      return resolveFixedConnection(ctx.pool!, args.server);
    } catch (fixedError) {
      if (args.server && store && ctx.transport === "http" && findDynamicScopeForServer(ctx, args.server)) {
        throw new Error("connection_scope is required for dynamic servers on HTTP. Call connect_server first.");
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
