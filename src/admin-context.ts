import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import { isContextOffline, requirePool, type ServerContext } from "./client.js";
import {
  resolveClient,
  resolveModelId,
  resolveServerPolicy,
  resolveServerRef,
  resolveStoreId,
  type ServerPolicy,
} from "./server-pool.js";

export type AdminTarget = {
  serverRef: string;
  client: OpenFgaClientType;
  policy: ServerPolicy;
  store?: string;
  model?: string;
};

export type AdminTargetInput = {
  server?: string;
  store?: string;
  model?: string;
  requireStore?: boolean;
};

export function resolveAdminTarget(ctx: ServerContext, input: AdminTargetInput = {}): AdminTarget | string {
  if (isContextOffline(ctx)) {
    return "❌ Operation requires a live OpenFGA instance. Configure FGA servers via --config or OPENFGA_MCP_API_URL.";
  }

  try {
    const pool = requirePool(ctx);
    const serverRef = resolveServerRef(pool, input.server);
    const policy = resolveServerPolicy(pool, serverRef);
    const client = resolveClient(pool, { server: serverRef });

    const target: AdminTarget = { serverRef, client, policy };

    if (input.requireStore !== false) {
      try {
        target.store = resolveStoreId(input.store, policy);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ ${message}`;
      }
    }

    if (input.model !== undefined || input.store !== undefined || policy.defaultModel) {
      target.model = resolveModelId(input.model, policy);
    }

    return target;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `❌ ${message}`;
  }
}

export function resolveTupleTarget(
  ctx: ServerContext,
  input: { server?: string; store?: string; model?: string },
): AdminTarget | string {
  return resolveAdminTarget(ctx, { ...input, requireStore: true });
}
