import { afterEach, describe, expect, it, vi } from "vitest";
import * as modelHandlers from "../../../src/tools/handlers/model.js";
import { parseDsl } from "../../../src/dsl.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setOnlineWritableMode, setEnv } from "../../helpers/env.js";

const VALID_DSL = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]`;

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("createModel", () => {
  it("creates an authorization model successfully", async () => {
    setOnlineWritableMode();
    const client = {
      writeAuthorizationModel: vi.fn().mockResolvedValue({ authorization_model_id: "model-456" }),
    };
    const result = await modelHandlers.createModel(createMockContext(client), VALID_DSL, "store-123");
    expect(result).toContain("✅ Successfully created authorization model");
    expect(result).toContain("model-456");
  });

  it("handles invalid DSL", async () => {
    setOnlineWritableMode();
    const client = { writeAuthorizationModel: vi.fn() };
    const result = await modelHandlers.createModel(createMockContext(client), "invalid dsl", "store-123");
    expect(result).toContain("❌ Failed to create authorization model");
  });

  it("allows creation when restrict is on without store pin but writeable", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    const client = { writeAuthorizationModel: vi.fn().mockResolvedValue({ authorization_model_id: "m1" }) };
    const result = await modelHandlers.createModel(createMockContext(client), VALID_DSL, "store-123");
    expect(result).toContain("✅ Successfully created");
  });

  it("handles model creation failure after successful DSL parsing", async () => {
    setOnlineWritableMode();
    const client = { writeAuthorizationModel: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await modelHandlers.createModel(createMockContext(client), VALID_DSL, "store-123");
    expect(result).toContain("❌ Failed to create authorization model");
    expect(result).toContain("Network error");
  });

  it("prevents model creation in read-only mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    const client = { writeAuthorizationModel: vi.fn() };
    const result = await modelHandlers.createModel(createMockContext(client), VALID_DSL, "store-123");
    expect(result).toContain("Write operations are disabled");
    expect(client.writeAuthorizationModel).not.toHaveBeenCalled();
  });

  it("prevents model creation in restricted mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { writeAuthorizationModel: vi.fn() };
    const result = await modelHandlers.createModel(createMockContext(client), VALID_DSL, "different-store");
    expect(result).toContain("Restricted: store must be");
    expect(client.writeAuthorizationModel).not.toHaveBeenCalled();
  });
});

describe("getModel", () => {
  it("gets model successfully", async () => {
    setOnlineWritableMode();
    const client = {
      readAuthorizationModel: vi.fn().mockResolvedValue({ authorization_model: { id: "model-456" } }),
    };
    const result = await modelHandlers.getModel(createMockContext(client), "store-123", "model-456");
    expect(result).toContain("model-456");
  });

  it("prevents getting model from non-restricted store", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { readAuthorizationModel: vi.fn() };
    const result = await modelHandlers.getModel(createMockContext(client), "different-store", "model-123");
    expect(result).toContain("allowed-store");
  });

  it("handles model not found", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModel: vi.fn().mockResolvedValue({ authorization_model: undefined }) };
    const result = await modelHandlers.getModel(createMockContext(client), "store-123", "model-456");
    expect(result).toBe("❌ Authorization model not found!");
  });

  it("handles get model failure", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModel: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await modelHandlers.getModel(createMockContext(client), "store-123", "model-456");
    expect(result).toContain("❌ Failed to get authorization model");
    expect(result).toContain("Network error");
  });

  it("prevents getting non-restricted model", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    const client = { readAuthorizationModel: vi.fn() };
    const result = await modelHandlers.getModel(createMockContext(client), "store-123", "different-model");
    expect(result).toContain("allowed-model");
    expect(client.readAuthorizationModel).not.toHaveBeenCalled();
  });
});

describe("getModelDsl", () => {
  it("returns DSL for model", async () => {
    setOnlineWritableMode();
    const parsed = parseDsl(VALID_DSL);
    const client = {
      readAuthorizationModel: vi.fn().mockResolvedValue({
        authorization_model: {
          id: "model-456",
          schema_version: parsed.schema_version,
          type_definitions: parsed.type_definitions,
          conditions: parsed.conditions,
        },
      }),
    };
    const result = await modelHandlers.getModelDsl(createMockContext(client), "store-123", "model-456");
    expect(result).toContain("type user");
  });

  it("handles model not found", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModel: vi.fn().mockResolvedValue({ authorization_model: undefined }) };
    const result = await modelHandlers.getModelDsl(createMockContext(client), "store-123", "model-456");
    expect(result).toBe("❌ Authorization model not found!");
  });

  it("handles get model DSL failure", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModel: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await modelHandlers.getModelDsl(createMockContext(client), "store-123", "model-456");
    expect(result).toContain("❌ Failed to get authorization model");
    expect(result).toContain("Network error");
  });
});

describe("listModels", () => {
  it("lists models", async () => {
    setOnlineWritableMode();
    const client = {
      readAuthorizationModels: vi.fn().mockResolvedValue({ authorization_models: [{ id: "model-1" }, { id: "model-2" }] }),
    };
    const result = await modelHandlers.listModels(createMockContext(client), "store-123");
    expect(result).toEqual([{ id: "model-1" }, { id: "model-2" }]);
  });

  it("handles list models failure", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModels: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await modelHandlers.listModels(createMockContext(client), "store-123");
    expect(result).toContain("❌ Failed to list authorization models");
    expect(result).toContain("Network error");
  });

  it("prevents listing models from non-restricted store", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { readAuthorizationModels: vi.fn() };
    const result = await modelHandlers.listModels(createMockContext(client), "different-store");
    expect(result).toContain("allowed-store");
    expect(client.readAuthorizationModels).not.toHaveBeenCalled();
  });
});

describe("verifyModel", () => {
  it("verifies valid DSL successfully", async () => {
    setOnlineWritableMode();
    const result = await modelHandlers.verifyModel(createMockContext({}), VALID_DSL);
    expect(result).toBe("✅ Successfully verified! This DSL appears to represent a valid authorization model.");
  });

  it("handles invalid DSL", async () => {
    setOnlineWritableMode();
    const result = await modelHandlers.verifyModel(createMockContext({}), "invalid dsl");
    expect(result).toContain("❌ Failed to verify authorization model");
  });

  it("verifies DSL in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await modelHandlers.verifyModel(createOfflineContext(), VALID_DSL);
    expect(result).toContain("✅ Successfully verified");
  });
});
