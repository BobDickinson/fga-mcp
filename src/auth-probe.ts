export type AuthProbeResult =
  | { status: "open" }
  | { status: "auth_required" }
  | { status: "error"; message: string };

export async function probeOpenFgaAuth(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<AuthProbeResult> {
  const base = apiUrl.trim().replace(/\/+$/, "");
  const url = `${base}/stores?page_size=1`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status === 200) return { status: "open" };
    if (response.status === 401) return { status: "auth_required" };
    if (response.status === 403) {
      return {
        status: "error",
        message: `Unauthenticated probe to ${base} returned 403 — check proxy or FGA configuration before eliciting credentials.`,
      };
    }

    return {
      status: "error",
      message: `Unauthenticated probe to ${base} returned HTTP ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message: `Could not probe ${base}: ${message}` };
  }
}

import { OpenFgaClient } from "@openfga/sdk";
import type { ServerAuth } from "./fga-config.js";
import { buildCredentialsFromAuth } from "./server-pool.js";

export async function validateOpenFgaAuth(apiUrl: string, auth: ServerAuth, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  void fetchImpl;
  const client = new OpenFgaClient({
    apiUrl: apiUrl.trim(),
    credentials: buildCredentialsFromAuth(auth),
  });
  try {
    await client.listStores({ pageSize: 1 });
    return true;
  } catch {
    return false;
  }
}
