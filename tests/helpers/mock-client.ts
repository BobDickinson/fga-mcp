import type { OpenFgaClient } from "@openfga/sdk";
import type { ServerContext } from "../../src/client.js";

export function createMockContext(client: Partial<OpenFgaClient>): ServerContext {
  return { client: client as OpenFgaClient, offline: false };
}

export function createOfflineContext(): ServerContext {
  return { client: null, offline: true };
}
