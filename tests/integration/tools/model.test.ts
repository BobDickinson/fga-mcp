import { afterEach, describe, expect, it } from "vitest";
import * as modelHandlers from "../../../src/tools/handlers/model.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";
import {
  createTestModel,
  createTestStore,
  deleteTestStore,
  getTestClient,
  setupTestStoreWithModel,
} from "../helpers.js";

const PROJECT_DSL = `model
  schema 1.1

type user

type project
  relations
    define owner: [user]
    define member: [user] or owner
    define viewer: [user] or member`;

function ctx() {
  return createMockContext(getTestClient());
}

afterEach(() => {
  clearOpenFgaEnv();
  process.env.OPENFGA_MCP_API_URL = process.env.OPENFGA_MCP_API_URL ?? "http://localhost:8080";
  process.env.OPENFGA_MCP_API_WRITEABLE = "true";
});

describe("ModelTools Integration", () => {
  it("can create an authorization model", async () => {
    const storeId = await createTestStore();
    const result = await modelHandlers.createModel(ctx(), PROJECT_DSL, storeId);
    expect(result).toContain("✅ Successfully created authorization model");
    expect(result).toContain("Model ID:");

    const match = result.match(/Model ID: ([a-zA-Z0-9_-]+)/);
    expect(match?.[1]).toBeTruthy();
  });

  it("can get an authorization model", async () => {
    const { store, model } = await setupTestStoreWithModel();
    const result = await modelHandlers.getModel(ctx(), store, model);
    expect(result).toContain("✅ Found authorization model");
    expect(result).toContain(model);
  });

  it("can get model DSL", async () => {
    const customDsl = `model
  schema 1.1

type organization

type team
  relations
    define parent: [organization]
    define member: [user]

type user`;

    const { store, model } = await setupTestStoreWithModel(customDsl);
    const result = await modelHandlers.getModelDsl(ctx(), store, model);

    expect(typeof result).toBe("string");
    expect(result).toContain("type organization");
    expect(result).toContain("type team");
    expect(result).toContain("define parent: [organization]");
    expect(result).toContain("define member: [user]");
  });

  it("can list authorization models", async () => {
    const storeId = await createTestStore();
    const modelId1 = await createTestModel(storeId);
    const modelId2 = await createTestModel(storeId);

    const result = await modelHandlers.listModels(ctx(), storeId);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    const ids = (result as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(modelId1);
    expect(ids).toContain(modelId2);
  });

  it("can verify valid DSL", async () => {
    const validDsl = `model
  schema 1.1

type user

type folder
  relations
    define parent: [folder]
    define owner: [user]
    define editor: [user] or owner
    define viewer: [user] or editor or owner from parent`;

    const result = await modelHandlers.verifyModel(ctx(), validDsl);
    expect(result).toBe("✅ Successfully verified! This DSL appears to represent a valid authorization model.");
  });

  it("detects invalid DSL", async () => {
    const invalidDsl = `model
  schema 1.1

type user

type document
  relations
    define reader: [user
    define writer: [user]`;

    const result = await modelHandlers.verifyModel(ctx(), invalidDsl);
    expect(result).toContain("❌ Failed to verify authorization model");
  });

  it("handles non-existent model gracefully", async () => {
    const storeId = await createTestStore();
    const fakeModelId = "00000000-0000-0000-0000-000000000000";

    const result = await modelHandlers.getModel(ctx(), storeId, fakeModelId);
    expect(result).toContain("Failed to get authorization model");
  });

  it("respects read-only mode", async () => {
    const storeId = await createTestStore();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");

    const dsl = `model
  schema 1.1
type user`;

    const result = await modelHandlers.createModel(ctx(), dsl, storeId);
    expect(result).toBe(
      "❌ Write operations are disabled for safety. To enable create authorization models, set OPENFGA_MCP_API_WRITEABLE=true.",
    );
  });

  it("respects restricted mode for model access", async () => {
    const { store, model: allowedModelId } = await setupTestStoreWithModel();
    const restrictedModelId = await createTestModel(store);

    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", store);
    setEnv("OPENFGA_MCP_API_MODEL", allowedModelId);

    const allowedResult = await modelHandlers.getModel(ctx(), store, allowedModelId);
    expect(allowedResult).toContain("✅ Found authorization model");

    const restrictedResult = await modelHandlers.getModel(ctx(), store, restrictedModelId);
    expect(restrictedResult).toBe(
      `❌ The MCP server is configured in restricted mode. You cannot query using authorization models other than ${allowedModelId} in this mode.`,
    );
  });

  it("creates complex models with inheritance", async () => {
    const storeId = await createTestStore();
    const dslWithInheritance = `model
  schema 1.1

type user

type group
  relations
    define member: [user, group#member]

type document
  relations
    define owner: [user, group#member]
    define editor: [user, group#member] or owner
    define viewer: [user, group#member] or editor`;

    const result = await modelHandlers.createModel(ctx(), dslWithInheritance, storeId);
    expect(result).toContain("✅ Successfully created authorization model");

    const match = result.match(/Model ID: ([a-zA-Z0-9_-]+)/);
    expect(match?.[1]).toBeTruthy();
    const modelId = match![1];

    const dslResult = await modelHandlers.getModelDsl(ctx(), storeId, modelId);
    expect(dslResult).toContain("group#member");
  });
});
