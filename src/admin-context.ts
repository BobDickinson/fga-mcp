import type { OpenFgaClient as OpenFgaClientType } from "@openfga/sdk";
import { isContextOffline, type ServerContext } from "./client.js";
import { resolveAdminConnection, type AdminResolveInput } from "./connection-resolver.js";

export type AdminTarget = {
  serverRef: string;
  client: OpenFgaClientType;
  policy: import("./server-pool.js").ServerPolicy;
  store?: string;
  model?: string;
  connectionScope?: string;
};

export type AdminTargetInput = AdminResolveInput;

export function resolveAdminTarget(ctx: ServerContext, input: AdminTargetInput = {}): AdminTarget | string {
  if (isContextOffline(ctx)) {
    return "❌ Operation requires a live OpenFGA instance. Configure FGA servers via --config or OPENFGA_MCP_API_URL.";
  }

  try {
    const resolved = resolveAdminConnection(ctx, input);
    return {
      serverRef: resolved.serverRef,
      client: resolved.client,
      policy: resolved.policy,
      store: resolved.store,
      model: resolved.model,
      connectionScope: resolved.connectionScope,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `❌ ${message}`;
  }
}

export function resolveTupleTarget(
  ctx: ServerContext,
  input: { connectionScope?: string; server?: string; store?: string; model?: string },
): AdminTarget | string {
  return resolveAdminTarget(ctx, { ...input, requireStore: true });
}
