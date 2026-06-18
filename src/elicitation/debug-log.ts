import type { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { isDebugEnabled, logServerLifecycle } from "../debug-logger.js";

export type ElicitationDebugContext = Record<string, unknown>;

function summarizeClientCaps(caps: ClientCapabilities | null | undefined): Record<string, unknown> {
  if (!caps) return { present: false };
  return {
    present: true,
    elicitation: caps.elicitation ?? null,
    supportsUrl: Boolean(caps.elicitation?.url),
    supportsForm: Boolean(caps.elicitation?.form),
  };
}

export function logElicitationDebug(event: string, context: ElicitationDebugContext = {}): void {
  if (!isDebugEnabled()) return;

  const payload = {
    ...context,
    ...(context.clientCapabilities !== undefined
      ? { clientCapabilities: summarizeClientCaps(context.clientCapabilities as ClientCapabilities | null) }
      : {}),
  };

  logServerLifecycle(`elicitation_${event}`, payload);

  const parts = [`[MCP DEBUG elicitation] ${event}`];
  if (context.trigger !== undefined) parts.push(`trigger=${String(context.trigger)}`);
  if (context.sessionId !== undefined) parts.push(`sessionId=${String(context.sessionId) || "(none)"}`);
  if (context.reason !== undefined) parts.push(`reason=${String(context.reason)}`);
  if (context.path !== undefined) parts.push(`path=${String(context.path)}`);
  if (context.clientCapabilities !== undefined) {
    const summary = summarizeClientCaps(context.clientCapabilities as ClientCapabilities | null);
    parts.push(`clientCaps=${JSON.stringify(summary)}`);
  }
  if (context.registryHit !== undefined) parts.push(`registryHit=${String(context.registryHit)}`);
  if (context.supportsUrlElicitation !== undefined) {
    parts.push(`supportsUrlElicitation=${String(context.supportsUrlElicitation)}`);
  }
  if (context.url !== undefined) parts.push(`url=${String(context.url)}`);
  process.stderr.write(`${parts.join(" ")}\n`);
}
