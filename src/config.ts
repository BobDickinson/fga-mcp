export function getConfiguredString(env: string, defaultValue = ""): string {
  const value = process.env[env];

  if (value === undefined || value === null || value === "" || value === "false") {
    return defaultValue;
  }

  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed === "false") {
    return defaultValue;
  }

  return trimmed;
}

export function getConfiguredInt(env: string, defaultValue = 0): number {
  const value = process.env[env];
  if (value === undefined || value === null || !/^-?\d+$/.test(value)) {
    return defaultValue;
  }
  return parseInt(value, 10);
}

export function getConfiguredBool(env: string, defaultValue = false): boolean {
  const value = process.env[env];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const stringValue = String(value);
  if (stringValue === "true" || stringValue === "1") {
    return true;
  }
  if (stringValue === "false" || stringValue === "0") {
    return false;
  }

  return defaultValue;
}

export function isOfflineMode(): boolean {
  const apiUrl = getConfiguredString("OPENFGA_MCP_API_URL", "");
  const hasToken = getConfiguredString("OPENFGA_MCP_API_TOKEN", "") !== "";
  const hasClientId = getConfiguredString("OPENFGA_MCP_API_CLIENT_ID", "") !== "";
  return apiUrl === "" && !hasToken && !hasClientId;
}

export function isRestrictedMode(): boolean {
  return getConfiguredString("OPENFGA_MCP_API_RESTRICT", "false") === "true";
}

export function isWriteEnabled(): boolean {
  return getConfiguredString("OPENFGA_MCP_API_WRITEABLE", "false") === "true";
}
