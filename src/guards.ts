import { isContextOffline, type ServerContext } from "./client.js";
import type { ServerPolicy } from "./server-pool.js";
import { getConfiguredString } from "./config.js";

export function checkOfflineMode(ctx: ServerContext, operation: string): string | null {
  if (isContextOffline(ctx)) {
    return `❌ ${operation} requires a live OpenFGA instance. Please configure OPENFGA_MCP_API_URL or an FGA config file to enable administrative features.`;
  }
  return null;
}

export function checkRestrictedMode(
  policy: ServerPolicy,
  storeId?: string | null,
  modelId?: string | null,
): string | null {
  if (!policy.restrict) return null;

  if (policy.defaultStore && storeId && policy.defaultStore !== storeId) {
    return `❌ Restricted: store must be ${policy.defaultStore} on this server.`;
  }

  if (policy.defaultModel && modelId && policy.defaultModel !== modelId) {
    return `❌ Restricted: model must be ${policy.defaultModel} on this server.`;
  }

  return null;
}

export function checkWritePermission(policy: ServerPolicy, operation: string): string | null {
  if (policy.writeable) return null;
  return `❌ Write operations are disabled on this server. To enable ${operation}, set writeable: true in the FGA config for this server or defaults.writeable globally.`;
}

export function checkOfflineModeResource(ctx: ServerContext, operation: string): Record<string, unknown> | null {
  const error = checkOfflineMode(ctx, operation);
  return error ? { error } : null;
}

export function checkRestrictedModeResource(
  policy: ServerPolicy,
  storeId?: string | null,
  modelId?: string | null,
): Record<string, unknown> | null {
  const error = checkRestrictedMode(policy, storeId, modelId);
  return error ? { error } : null;
}

export function checkRestrictedModePrompt(
  storeId?: string | null,
  modelId?: string | null,
  policy?: ServerPolicy | null,
): string | null {
  const effectivePolicy = policy ?? legacyEnvPolicy();
  if (!effectivePolicy?.restrict) return null;

  if (effectivePolicy.defaultStore && storeId && effectivePolicy.defaultStore !== storeId) {
    return `❌ The MCP server is configured in restricted mode. You cannot access guidance for stores other than ${effectivePolicy.defaultStore} in this mode.`;
  }

  if (effectivePolicy.defaultModel && modelId && effectivePolicy.defaultModel !== modelId) {
    return `❌ The MCP server is configured in restricted mode. You cannot access guidance for authorization models other than ${effectivePolicy.defaultModel} in this mode.`;
  }

  return null;
}

function legacyEnvPolicy(): ServerPolicy | null {
  if (getConfiguredString("OPENFGA_MCP_API_RESTRICT", "false") !== "true") return null;
  return {
    restrict: true,
    writeable: getConfiguredString("OPENFGA_MCP_API_WRITEABLE", "false") === "true",
    defaultStore: getConfiguredString("OPENFGA_MCP_API_STORE", "") || undefined,
    defaultModel: getConfiguredString("OPENFGA_MCP_API_MODEL", "") || undefined,
  };
}

/** @deprecated restrict no longer blocks writes — use checkWritePermission */
export function checkRestrictedModeForWrites(_operation: string): string | null {
  return null;
}

export function isRestrictedMode(): boolean {
  return getConfiguredString("OPENFGA_MCP_API_RESTRICT", "false") === "true";
}

export function isWriteEnabled(): boolean {
  return getConfiguredString("OPENFGA_MCP_API_WRITEABLE", "false") === "true";
}

export function promptErrorResponse(error: string | null) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: error ?? "Unknown error" } }] };
}

export function promptUserMessage(content: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: content } }] };
}
