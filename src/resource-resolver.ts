import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import { isContextOffline, type ServerContext } from "./client.js";
import { resolveConnection, type ResolvedConnection } from "./connection-resolver.js";
import { checkRestrictedModeResource } from "./guards.js";
import { isDynamicConnectionsEnabled } from "./connection-resolver.js";
import type { ServerPolicy } from "./server-pool.js";

export type ResourceRegistrationPlan = {
  legacyFixed: boolean;
  fixedServerPrefixed: boolean;
  dynamicScopePrefixed: boolean;
};

export type ResourceTargetInput = {
  connectionScope?: string;
  server?: string;
  storeId?: string;
  model?: string;
  dynamicOnly?: boolean;
};

export type ResourceTarget = ResolvedConnection & {
  storeId?: string;
  model?: string;
};

export function getResourceRegistrationPlan(ctx: ServerContext): ResourceRegistrationPlan {
  const fixedCount = ctx.pool?.servers.size ?? 0;
  const dynamicConnections = isDynamicConnectionsEnabled(ctx);

  return {
    legacyFixed: fixedCount === 1 && !dynamicConnections,
    fixedServerPrefixed: fixedCount > 1 || (fixedCount >= 1 && dynamicConnections),
    dynamicScopePrefixed: dynamicConnections,
  };
}

export function normalizeResourceTarget(params: Record<string, string | undefined>): ResourceTargetInput {
  return {
    connectionScope: params.connectionScope?.trim() || undefined,
    server: params.server?.trim() || undefined,
    storeId: params.storeId?.trim() || undefined,
    model: params.modelId?.trim() || params.model?.trim() || undefined,
  };
}

export function resolveResourceTarget(
  ctx: ServerContext,
  input: ResourceTargetInput,
): ResourceTarget | Record<string, unknown> {
  if (isContextOffline(ctx)) {
    return {
      error:
        "❌ Resource requires a live OpenFGA instance. Configure FGA servers via --config or use connect_server.",
    };
  }

  try {
    const connection = resolveConnection(ctx, {
      connectionScope: input.connectionScope,
      server: input.server,
    });

    if (input.dynamicOnly && !connection.dynamic) {
      throw new Error("This resource URI requires a dynamic connection scope.");
    }

    if (input.storeId) {
      const restrict = checkRestrictedModeResource(connection.policy, input.storeId, input.model);
      if (restrict) return restrict;
    }

    return {
      ...connection,
      storeId: input.storeId,
      model: input.model,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `❌ ${message}` };
  }
}

export function isResourceTarget(value: ResourceTarget | Record<string, unknown>): value is ResourceTarget {
  return "client" in value && typeof (value as ResourceTarget).client === "object";
}

export type CompletionScope = {
  connectionScope?: string;
  server?: string;
  storeId?: string;
};

export function resolveCompletionClient(ctx: ServerContext, scope: CompletionScope): OpenFgaClientType | null {
  if (isContextOffline(ctx)) return null;
  try {
    return resolveConnection(ctx, {
      connectionScope: scope.connectionScope,
      server: scope.server,
    }).client;
  } catch {
    return null;
  }
}

export function resolveCompletionPolicy(ctx: ServerContext, scope: CompletionScope): ServerPolicy | null {
  if (isContextOffline(ctx)) return null;
  try {
    return resolveConnection(ctx, {
      connectionScope: scope.connectionScope,
      server: scope.server,
    }).policy;
  } catch {
    return null;
  }
}
