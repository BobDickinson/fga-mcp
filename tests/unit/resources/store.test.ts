import { afterEach, describe, expect, it, vi } from "vitest";
import * as storeResources from "../../../src/resources/handlers/store.js";
import { createOfflineContext } from "../../helpers/mock-client.js";
import { targetFrom } from "../../helpers/resource-target.js";
import { resolveResourceTarget } from "../../../src/resource-resolver.js";
import { clearOpenFgaEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("listStores resource", () => {
  it("calls listStores on the client", async () => {
    setOnlineWritableMode();
    const client = { listStores: vi.fn().mockResolvedValue({ stores: [] }) };
    const result = await storeResources.listStores(targetFrom(client));
    expect(result.stores).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("handles listStores errors", async () => {
    setOnlineWritableMode();
    const client = { listStores: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await storeResources.listStores(targetFrom(client));
    expect(result.error).toContain("Failed to fetch stores");
  });
});

describe("getStore resource", () => {
  it("returns store details", async () => {
    setOnlineWritableMode();
    const client = {
      getStore: vi.fn().mockResolvedValue({
        id: "test-store-id",
        name: "test",
        created_at: "2024-01-01",
        updated_at: "2024-01-02",
      }),
    };
    const result = await storeResources.getStore(targetFrom(client), "test-store-id");
    expect(result.id).toBe("test-store-id");
  });

  it("handles getStore errors", async () => {
    setOnlineWritableMode();
    const client = { getStore: vi.fn().mockRejectedValue(new Error("Store not found")) };
    const result = await storeResources.getStore(targetFrom(client), "non-existent-store");
    expect(result.error).toContain("Failed to fetch store");
  });
});

describe("listStoreModels resource", () => {
  it("returns models for a store", async () => {
    setOnlineWritableMode();
    const storeId = "test-store-id";
    const client = { readAuthorizationModels: vi.fn().mockResolvedValue({ authorization_models: [] }) };
    const result = await storeResources.listStoreModels(targetFrom(client), storeId);
    expect(result.store_id).toBe(storeId);
    expect(result.models).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("handles listAuthorizationModels errors", async () => {
    setOnlineWritableMode();
    const client = { readAuthorizationModels: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await storeResources.listStoreModels(targetFrom(client), "test-store-id");
    expect(result.error).toContain("Failed to fetch models");
  });
});

describe("offline mode behavior", () => {
  it("resolveResourceTarget returns error when offline", () => {
    clearOpenFgaEnv();
    const result = resolveResourceTarget(createOfflineContext(), {});
    expect(result).toEqual({
      error: "❌ Resource requires a live OpenFGA instance. Configure FGA servers via --config or use connect_server.",
    });
  });
});
