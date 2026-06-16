import { afterEach, describe, expect, it, vi } from "vitest";
import * as modelResources from "../../../src/resources/handlers/model.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("getModel resource", () => {
  it("returns model details", async () => {
    setOnlineWritableMode();
    const client = {
      readAuthorizationModel: vi.fn().mockResolvedValue({
        authorization_model: {
          id: "test-model-id",
          type_definitions: [{ type: "user" }, { type: "document", relations: { reader: {} } }],
        },
      }),
    };
    const result = await modelResources.getModel(createMockContext(client), "test-store-id", "test-model-id");
    expect(result.id).toBe("test-model-id");
    expect(result.type_count).toBe(2);
  });

  it("handles getAuthorizationModel errors", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModel: vi.fn().mockRejectedValue(new Error("Not found")) };
    const result = await modelResources.getModel(createMockContext(client), "test-store-id", "non-existent-model");
    expect(result.error).toContain("Failed to fetch model");
  });
});

describe("getLatestModel resource", () => {
  it("returns latest model", async () => {
    setOnlineWritableMode();
    const client = {
      readAuthorizationModels: vi.fn().mockResolvedValue({
        authorization_models: [{ id: "latest-model", type_definitions: [{ type: "user" }] }],
      }),
    };
    const result = await modelResources.getLatestModel(createMockContext(client), "test-store-id");
    expect(result.id).toBe("latest-model");
    expect(result.is_latest).toBe(true);
  });

  it("handles empty store", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModels: vi.fn().mockResolvedValue({ authorization_models: [] }) };
    const result = await modelResources.getLatestModel(createMockContext(client), "test-store-id");
    expect(result.error).toContain("No models found");
  });

  it("handles listAuthorizationModels errors", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModels: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await modelResources.getLatestModel(createMockContext(client), "test-store-id");
    expect(result.error).toContain("Failed to fetch models");
  });
});

describe("offline mode behavior", () => {
  it("prevents getModel in offline mode", async () => {
    clearOpenFgaEnv();
    const client = { readAuthorizationModel: vi.fn() };
    const result = await modelResources.getModel(createMockContext(client), "test-store-id", "test-model-id");
    expect(result.error).toContain("Getting model details requires a live OpenFGA instance");
  });

  it("prevents getLatestModel in offline mode", async () => {
    clearOpenFgaEnv();
    const client = { readAuthorizationModels: vi.fn() };
    const result = await modelResources.getLatestModel(createMockContext(client), "test-store-id");
    expect(result.error).toContain("Getting latest model requires a live OpenFGA instance");
  });
});
