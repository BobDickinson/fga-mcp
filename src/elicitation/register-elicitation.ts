import type { FastMCP } from "fastmcp";
import type { FastMCPSession } from "fastmcp";
import { logElicitationDebug } from "./debug-log.js";
import { registerElicitationSession, unregisterElicitationSession } from "./session-registry.js";

function registerFromInitialized(session: FastMCPSession, trigger: string): void {
  const sessionId = session.sessionId;
  const clientCapabilities = session.server.getClientCapabilities() ?? null;

  if (!clientCapabilities) {
    logElicitationDebug("register_skipped", {
      trigger,
      sessionId,
      reason: "missing_client_capabilities",
    });
    return;
  }

  if (!sessionId) {
    logElicitationDebug("register_skipped", {
      trigger,
      sessionId,
      reason: "missing_session_id",
      clientCapabilities,
    });
    return;
  }

  registerElicitationSession(sessionId, {
    clientCapabilities,
    mcpServer: session.server,
  });

  logElicitationDebug("session_registered", {
    trigger,
    sessionId,
    clientCapabilities,
    supportsUrlElicitation: Boolean(clientCapabilities.elicitation?.url),
  });
}

export function registerElicitationSupport(server: FastMCP): void {
  logElicitationDebug("support_wired", {
    note: "Server does not advertise elicitation in initialize capabilities; Path A uses tools/call -32042 when client declares elicitation.url",
  });

  server.on("connect", ({ session }: { session: FastMCPSession }) => {
    logElicitationDebug("session_connect", {
      sessionId: session.sessionId,
      isReady: session.isReady,
      clientCapabilities: session.server.getClientCapabilities() ?? null,
    });

    session.server.oninitialized = () => {
      logElicitationDebug("client_initialized", {
        trigger: "oninitialized",
        sessionId: session.sessionId,
        clientCapabilities: session.server.getClientCapabilities() ?? null,
        note: "Client caps were set during initialize request; this fires on notifications/initialized",
      });
      registerFromInitialized(session, "oninitialized");
    };

    session.once("ready", () => {
      logElicitationDebug("session_ready", {
        trigger: "ready",
        sessionId: session.sessionId,
        clientCapabilities: session.server.getClientCapabilities() ?? null,
      });
      registerFromInitialized(session, "ready");
    });

    if (session.server.getClientCapabilities()) {
      registerFromInitialized(session, "connect_reconnect");
    }
  });

  server.on("disconnect", ({ session }: { session: FastMCPSession }) => {
    logElicitationDebug("session_disconnect", { sessionId: session.sessionId });
    unregisterElicitationSession(session.sessionId);
  });
}
