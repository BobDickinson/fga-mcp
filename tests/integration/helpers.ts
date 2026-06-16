import { OpenFgaClient } from "@openfga/sdk";
import { parseDsl } from "../../src/dsl.js";

const DEFAULT_MODEL_DSL = `model
  schema 1.1

type user

type document
  relations
    define reader: [user]
    define writer: [user]
    define owner: [user]`;

let sharedClient: OpenFgaClient | null = null;
const testStoreIds: string[] = [];

export async function waitForOpenFGA(url: string, maxAttempts = 60): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`OpenFGA failed to start within ${maxAttempts * 2} seconds`);
}

export function getTestClient(): OpenFgaClient {
  if (!sharedClient) {
    throw new Error("Integration test client not initialized");
  }
  return sharedClient;
}

export async function createTestStore(name?: string): Promise<string> {
  const storeName = name ?? `test-store-${Date.now()}`;
  const response = await getTestClient().createStore({ name: storeName });
  if (!response.id) throw new Error("Failed to create test store");
  testStoreIds.push(response.id);
  return response.id;
}

export async function deleteTestStore(storeId: string): Promise<void> {
  try {
    await getTestClient().deleteStore({ storeId });
  } catch {
    // ignore cleanup errors
  }
}

export async function writeTestTuples(
  storeId: string,
  modelId: string,
  tuples: Array<{ user: string; relation: string; object: string }>,
): Promise<void> {
  await getTestClient().write(
    { writes: tuples.map((t) => ({ user: t.user, relation: t.relation, object: t.object })) },
    { storeId, authorizationModelId: modelId },
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

export async function createTestModel(storeId: string, dsl = DEFAULT_MODEL_DSL): Promise<string> {
  const body = parseDsl(dsl);
  const response = await getTestClient().writeAuthorizationModel(body, { storeId });
  if (!response.authorization_model_id) throw new Error("Failed to create test model");
  return response.authorization_model_id;
}

export async function setupTestStore(): Promise<string> {
  return createTestStore();
}

export async function setupTestStoreWithModel(dsl?: string): Promise<{ store: string; model: string }> {
  const store = await setupTestStore();
  const model = await createTestModel(store, dsl);
  return { store, model };
}

export async function initIntegrationTests(): Promise<void> {
  const url = process.env.OPENFGA_MCP_API_URL ?? "http://localhost:8080";
  process.env.OPENFGA_MCP_API_URL = url;
  process.env.OPENFGA_MCP_API_WRITEABLE = "true";

  await waitForOpenFGA(url);
  sharedClient = new OpenFgaClient({ apiUrl: url });
}

export async function cleanupIntegrationTests(): Promise<void> {
  while (testStoreIds.length > 0) {
    const storeId = testStoreIds.pop();
    if (storeId) await deleteTestStore(storeId);
  }
}
