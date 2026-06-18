import type { AdminTarget } from "../../admin-context.js";
import type { ServerContext } from "../../client.js";
import { handleAdminTargetFgaAuthError } from "../../fga-call.js";
import type { ToolCallContext } from "../../elicitation/types.js";

export function formatFgaApiError(
  ctx: ServerContext,
  resolved: AdminTarget,
  error: unknown,
  toolCtx: ToolCallContext | undefined,
  prefix: string,
): string {
  handleAdminTargetFgaAuthError(ctx, resolved, error, toolCtx);
  const message = error instanceof Error ? error.message : String(error);
  return `❌ ${prefix} Error: ${message}`;
}
