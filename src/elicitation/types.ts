import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ServerAuth } from "../fga-config.js";

export type ElicitationReason = "connect" | "reauth";

export type ConnectMode = "api_url" | "server";

export type PendingElicitationStatus = "pending" | "completed" | "cancelled";

export type PendingElicitation = {
  elicitationId: string;
  reason: ElicitationReason;
  connectMode: ConnectMode;
  apiUrl: string;
  connectionScope?: string;
  server?: string;
  requestedName?: string;
  fixedFromConfig?: boolean;
  csrfToken: string;
  policyHints?: {
    restrict?: boolean;
    writeable?: boolean;
    defaultStore?: string;
    defaultModel?: string;
  };
  createdAt: number;
  expiresAt: number;
  status: PendingElicitationStatus;
  sessionId?: string;
  auth?: ServerAuth;
};

export type SessionRegistryEntry = {
  supportsUrlElicitation: boolean;
  mcpServer: Server;
};

export type ToolCallContext = {
  sessionId?: string;
};

export type ElicitationStructuredFallback = {
  elicitation_required: true;
  elicitation_id: string;
  url: string;
  reason: ElicitationReason;
  message: string;
};
