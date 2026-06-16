import { getConfiguredString, isOfflineMode, isRestrictedMode, isWriteEnabled } from "./config.js";

export function checkOfflineMode(operation: string): string | null {
  if (isOfflineMode()) {
    return `❌ ${operation} requires a live OpenFGA instance. Please configure OPENFGA_MCP_API_URL to enable administrative features.`;
  }
  return null;
}

export function checkRestrictedMode(storeId?: string | null, modelId?: string | null): string | null {
  if (!isRestrictedMode()) {
    return null;
  }

  if (storeId) {
    const restrictedStore = getConfiguredString("OPENFGA_MCP_API_STORE", "");
    if (restrictedStore !== "" && restrictedStore !== storeId) {
      return `❌ The MCP server is configured in restricted mode. You cannot query stores other than ${restrictedStore} in this mode.`;
    }
  }

  if (modelId) {
    const restrictedModel = getConfiguredString("OPENFGA_MCP_API_MODEL", "");
    if (restrictedModel !== "" && restrictedModel !== modelId) {
      return `❌ The MCP server is configured in restricted mode. You cannot query using authorization models other than ${restrictedModel} in this mode.`;
    }
  }

  return null;
}

export function checkRestrictedModeForWrites(operation: string): string | null {
  if (isRestrictedMode()) {
    return `❌ The MCP server is configured in restricted mode. You cannot ${operation} in this mode.`;
  }
  return null;
}

export function checkWritePermission(operation: string): string | null {
  if (!isWriteEnabled()) {
    return `❌ Write operations are disabled for safety. To enable ${operation}, set OPENFGA_MCP_API_WRITEABLE=true.`;
  }
  return null;
}

export function checkOfflineModeResource(operation: string): Record<string, unknown> | null {
  const error = checkOfflineMode(operation);
  return error ? { error } : null;
}

export function checkRestrictedModeResource(storeId?: string | null, modelId?: string | null): Record<string, unknown> | null {
  const error = checkRestrictedMode(storeId, modelId);
  return error ? { error } : null;
}

export function checkRestrictedModePrompt(storeId?: string | null, modelId?: string | null): string | null {
  if (!isRestrictedMode()) {
    return null;
  }

  if (storeId) {
    const restrictedStore = getConfiguredString("OPENFGA_MCP_API_STORE", "");
    if (restrictedStore !== "" && restrictedStore !== storeId) {
      return `❌ The MCP server is configured in restricted mode. You cannot access guidance for stores other than ${restrictedStore} in this mode.`;
    }
  }

  if (modelId) {
    const restrictedModel = getConfiguredString("OPENFGA_MCP_API_MODEL", "");
    if (restrictedModel !== "" && restrictedModel !== modelId) {
      return `❌ The MCP server is configured in restricted mode. You cannot access guidance for authorization models other than ${restrictedModel} in this mode.`;
    }
  }

  return null;
}

export function promptErrorResponse(error: string | null) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: error ?? "Unknown error" } }] };
}

export function promptUserMessage(content: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: content } }] };
}
