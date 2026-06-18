import type { AdminTarget } from "./admin-context.js";
import type { ServerContext } from "./client.js";
import type { ResolvedConnection } from "./connection-resolver.js";
import { classifyOpenFgaAuthError } from "./openfga-auth-error.js";
import { throwReauthElicitation } from "./connect-flow.js";
import type { ToolCallContext } from "./elicitation/types.js";

export function handleScopedFgaAuthError(
  ctx: ServerContext,
  connection: ResolvedConnection,
  error: unknown,
  toolCtx?: ToolCallContext,
): void {
  const credSource = connection.scoped ? "scoped" : connection.dynamic ? "scoped" : "config";
  const action = classifyOpenFgaAuthError(error, credSource);
  if (action === "re_elicit" && connection.connectionScope) {
    throwReauthElicitation(ctx, {
      apiUrl: connection.apiUrl,
      server: connection.serverRef,
      connectionScope: connection.connectionScope,
      toolCtx,
    });
  }
}

export function handleAdminTargetFgaAuthError(
  ctx: ServerContext,
  target: AdminTarget,
  error: unknown,
  toolCtx?: ToolCallContext,
): void {
  handleScopedFgaAuthError(
    ctx,
    {
      client: target.client,
      serverRef: target.serverRef,
      apiUrl: target.apiUrl,
      policy: target.policy,
      connectionScope: target.connectionScope,
      dynamic: Boolean(target.connectionScope) && !target.scoped,
      scoped: target.scoped || Boolean(target.connectionScope),
    },
    error,
    toolCtx,
  );
}
