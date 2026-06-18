import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { SessionRegistryEntry } from "./types.js";

const sessions = new Map<string, SessionRegistryEntry>();

export function registerElicitationSession(
  sessionId: string,
  entry: { clientCapabilities: ClientCapabilities | null; mcpServer: Server },
): void {
  sessions.set(sessionId, {
    supportsUrlElicitation: Boolean(entry.clientCapabilities?.elicitation?.url),
    mcpServer: entry.mcpServer,
  });
}

export function unregisterElicitationSession(sessionId: string | undefined): void {
  if (!sessionId) return;
  sessions.delete(sessionId);
}

export function getElicitationSession(sessionId: string | undefined): SessionRegistryEntry | undefined {
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
}

export function clearElicitationSessions(): void {
  sessions.clear();
}
