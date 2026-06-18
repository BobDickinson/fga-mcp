export type CredentialSource = "config" | "scoped" | "none";

export type OpenFgaAuthAction = "refresh_config" | "re_elicit" | "other";

export function isOpenFga401(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode === 401) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b/.test(message) || /unauthorized/i.test(message);
}

export function classifyOpenFgaAuthError(
  error: unknown,
  credSource: CredentialSource,
): OpenFgaAuthAction {
  if (!isOpenFga401(error)) return "other";
  if (credSource === "config") return "refresh_config";
  if (credSource === "scoped") return "re_elicit";
  return "other";
}

export function credentialSourceForConnection(dynamic: boolean, hasConfigAuth: boolean): CredentialSource {
  if (dynamic) return "scoped";
  if (hasConfigAuth) return "config";
  return "none";
}
