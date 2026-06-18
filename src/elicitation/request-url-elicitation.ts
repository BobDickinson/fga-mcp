import { UserError } from "fastmcp";
import { UrlElicitationRequiredError } from "@modelcontextprotocol/sdk/types.js";
import type { ServerContext } from "../client.js";
import { logElicitationDebug } from "./debug-log.js";
import { buildElicitationUrl } from "./public-url.js";
import type { PendingElicitationStore } from "./pending-store.js";
import { getElicitationSession } from "./session-registry.js";
import type { ElicitationReason, ToolCallContext } from "./types.js";

export type RequestUrlElicitationInput = {
  ctx: ServerContext;
  pendingStore: PendingElicitationStore;
  reason: ElicitationReason;
  connectMode: "api_url" | "server";
  apiUrl: string;
  message: string;
  server?: string;
  requestedName?: string;
  fixedFromConfig?: boolean;
  connectionScope?: string;
  policyHints?: {
    restrict?: boolean;
    writeable?: boolean;
    defaultStore?: string;
    defaultModel?: string;
  };
  toolCtx?: ToolCallContext;
};

export function stdioElicitationUnavailableMessage(serverName?: string): string {
  const target = serverName ? `"${serverName}"` : "the target OpenFGA server";
  return (
    `OpenFGA server ${target} requires authentication. Credential elicitation is not available on stdio transport.\n` +
    "Add an auth block to your FGA config for this server, or run fga-mcp with --transport http\n" +
    "(and set OPENFGA_MCP_PUBLIC_URL if the auth page is not at http://127.0.0.1:<port>)."
  );
}

function pathBFallbackMessage(message: string, url: string): string {
  return `${message}\n\nOpen this URL in your browser to authenticate:\n${url}`;
}

export function requestUrlElicitation(input: RequestUrlElicitationInput): never {
  const { ctx, pendingStore, toolCtx } = input;

  if (ctx.transport === "stdio") {
    throw new Error(stdioElicitationUnavailableMessage(input.server));
  }

  pendingStore.purgeExpired();

  const pending = pendingStore.create({
    reason: input.reason,
    connectMode: input.connectMode,
    apiUrl: input.apiUrl,
    connectionScope: input.connectionScope,
    server: input.server,
    requestedName: input.requestedName,
    fixedFromConfig: input.fixedFromConfig,
    sessionId: toolCtx?.sessionId,
    policyHints: input.policyHints,
  });

  const url = buildElicitationUrl(ctx.publicUrl, pending.elicitationId);
  const session = getElicitationSession(toolCtx?.sessionId);

  logElicitationDebug("elicitation_branch", {
    sessionId: toolCtx?.sessionId,
    registryHit: Boolean(session),
    supportsUrlElicitation: session?.supportsUrlElicitation ?? false,
    reason: input.reason,
    url,
    publicUrl: ctx.publicUrl,
  });

  if (session?.supportsUrlElicitation) {
    logElicitationDebug("path_a", {
      sessionId: toolCtx?.sessionId,
      path: "UrlElicitationRequiredError",
      url,
    });
    throw new UrlElicitationRequiredError([
      {
        mode: "url",
        elicitationId: pending.elicitationId,
        url,
        message: input.message,
      },
    ]);
  }

  logElicitationDebug("path_b", {
    sessionId: toolCtx?.sessionId,
    path: "UserError",
    url,
    note: "Client did not declare elicitation.url or session was not registered",
  });

  throw new UserError(pathBFallbackMessage(input.message, url), {
    elicitation_required: true,
    elicitation_id: pending.elicitationId,
    url,
    reason: input.reason,
    message: input.message,
  });
}

export async function notifyElicitationComplete(
  sessionId: string | undefined,
  elicitationId: string,
): Promise<void> {
  const session = getElicitationSession(sessionId);
  if (!session?.supportsUrlElicitation) return;
  try {
    await session.mcpServer.createElicitationCompletionNotifier(elicitationId)();
  } catch {
    // Optional UX notification — ignore delivery failures.
  }
}
