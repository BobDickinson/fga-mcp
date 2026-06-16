import { describe, expect, it } from "vitest";
import * as storeResources from "../../../src/resources/handlers/store.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { createTestStore, deleteTestStore, getTestClient, setupTestStore, setupTestStoreWithModel } from "../helpers.js";

function ctx() {
  return createMockContext(getTestClient());
}

describe("StoreResources Integration", () => {
  it("lists real stores including test stores", async () => {
    const testStoreName = `Test Store ${Date.now()}`;
    const storeId = await createTestStore(testStoreName);

    try {
      const result = await storeResources.listStores(ctx());
      expect(Array.isArray(result.stores)).toBe(true);
      expect(result.count).toBeGreaterThan(0);

      const foundStore = (result.stores as Array<{ id: string; name: string; created_at: unknown }>).find((s) => s.id === storeId);
      expect(foundStore).toBeDefined();
      expect(foundStore!.name).toBe(testStoreName);
      expect(foundStore!.created_at).toBeTruthy();
    } finally {
      await deleteTestStore(storeId);
    }
  });

  it("gets specific store details", async () => {
    const testStoreName = `Test Store Details ${Date.now()}`;
    const storeId = await createTestStore(testStoreName);

    try {
      const result = await storeResources.getStore(ctx(), storeId);
      expect(result.id).toBe(storeId);
      expect(result.name).toBe(testStoreName);
      expect(result.created_at).toBeTruthy();
    } finally {
      await deleteTestStore(storeId);
    }
  });

  it("handles non-existent store gracefully", async () => {
    const result = await storeResources.getStore(ctx(), "non-existent-store-id");
    expect(result.error).toContain("❌ Failed to fetch store!");
  });

  it("lists models in a store", async () => {
    const dsl = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]
    define writer: [user]`;
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(dsl);

    const result = await storeResources.listStoreModels(ctx(), storeId);
    expect(result.store_id).toBe(storeId);
    expect((result.models as Array<{ id: string }>).length).toBe(1);
    expect((result.models as Array<{ id: string }>)[0].id).toBe(modelId);
    expect((result.models as Array<{ schema_version: string }>)[0].schema_version).toBe("1.1");
    expect((result.models as Array<{ type_definitions: number }>)[0].type_definitions).toBe(2);
  });

  it("handles store with no models", async () => {
    const storeId = await setupTestStore();
    const result = await storeResources.listStoreModels(ctx(), storeId);
    expect(result.store_id).toBe(storeId);
    expect(result.models).toEqual([]);
    expect(result.count).toBe(0);
  });
});
