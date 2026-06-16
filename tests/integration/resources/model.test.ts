import { describe, expect, it } from "vitest";
import * as modelResources from "../../../src/resources/handlers/model.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { createTestModel, getTestClient, setupTestStore, setupTestStoreWithModel } from "../helpers.js";

function ctx() {
  return createMockContext(getTestClient());
}

const COMPLEX_DSL = `model
  schema 1.1
type user
type group
  relations
    define member: [user]
type document
  relations
    define reader: [user, group#member]
    define writer: [user]
    define owner: [user]`;

describe("ModelResources Integration", () => {
  it("gets model details", async () => {
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(COMPLEX_DSL);
    const result = await modelResources.getModel(ctx(), storeId, modelId);

    expect(result.id).toBe(modelId);
    expect(result.schema_version).toBe("1.1");
    expect(result.type_count).toBe(3);

    const types = (result.type_definitions as Array<{ type: string; relations: string[] }>).map((t) => t.type);
    expect(types).toContain("user");
    expect(types).toContain("group");
    expect(types).toContain("document");

    const documentType = (result.type_definitions as Array<{ type: string; relations: string[] }>).find((t) => t.type === "document");
    expect(documentType!.relations).toContain("reader");
    expect(documentType!.relations).toContain("writer");
    expect(documentType!.relations).toContain("owner");
  });

  it("gets latest model in store", async () => {
    const dsl1 = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]`;
    const { store: storeId } = await setupTestStoreWithModel(dsl1);

    const dsl2 = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]
    define writer: [user]`;
    const latestModelId = await createTestModel(storeId, dsl2);

    const result = await modelResources.getLatestModel(ctx(), storeId);
    expect(result.store_id).toBe(storeId);
    expect(result.id).toBe(latestModelId);
    expect(result.is_latest).toBe(true);
    expect(result.type_count).toBe(2);

    const documentType = (result.type_definitions as Array<{ type: string; relations: string[] }>).find((t) => t.type === "document");
    expect(documentType!.relations).toContain("writer");
  });

  it("handles store with no models", async () => {
    const storeId = await setupTestStore();
    const result = await modelResources.getLatestModel(ctx(), storeId);
    expect(result.error).toContain("❌ No models found in the store");
  });

  it("handles non-existent model", async () => {
    const storeId = await setupTestStore();
    const result = await modelResources.getModel(ctx(), storeId, "non-existent-model-id");
    expect(result.error).toContain("❌ Failed to fetch model!");
  });
});
