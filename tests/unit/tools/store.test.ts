import { afterEach, describe, expect, it, vi } from "vitest";
import * as storeHandlers from "../../../src/tools/handlers/store.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setOnlineWritableMode, setEnv } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("createStore", () => {
  it("creates a store successfully", async () => {
    setOnlineWritableMode();
    const client = {
      createStore: vi.fn().mockResolvedValue({ id: "store-123" }),
    };
    const result = await storeHandlers.createStore(createMockContext(client), "test-store");
    expect(result).toContain("✅ Successfully created store");
    expect(result).toContain("test-store");
    expect(result).toContain("store-123");
  });

  it("handles store creation failure", async () => {
    setOnlineWritableMode();
    const client = {
      createStore: vi.fn().mockRejectedValue(new Error("Network error")),
    };
    const result = await storeHandlers.createStore(createMockContext(client), "test-store");
    expect(result).toContain("❌ Failed to create store");
    expect(result).toContain("Network error");
  });

  it("prevents store creation in read-only mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    const client = { createStore: vi.fn() };
    const result = await storeHandlers.createStore(createMockContext(client), "test-store");
    expect(result).toBe("❌ Write operations are disabled for safety. To enable create stores, set OPENFGA_MCP_API_WRITEABLE=true.");
    expect(client.createStore).not.toHaveBeenCalled();
  });

  it("prevents store creation in restricted mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    const client = { createStore: vi.fn() };
    const result = await storeHandlers.createStore(createMockContext(client), "test-store");
    expect(result).toContain("restricted mode");
    expect(client.createStore).not.toHaveBeenCalled();
  });

  it("prevents store creation in offline mode", async () => {
    clearOpenFgaEnv();
    const client = { createStore: vi.fn() };
    const result = await storeHandlers.createStore(createMockContext(client), "test-store");
    expect(result).toContain("Creating stores requires a live OpenFGA instance");
    expect(client.createStore).not.toHaveBeenCalled();
  });
});

describe("deleteStore", () => {
  it("deletes a store successfully", async () => {
    setOnlineWritableMode();
    const client = { deleteStore: vi.fn().mockResolvedValue(undefined) };
    const result = await storeHandlers.deleteStore(createMockContext(client), "store-123");
    expect(result).toBe("✅ Successfully deleted store!");
  });

  it("handles store deletion failure", async () => {
    setOnlineWritableMode();
    const client = { deleteStore: vi.fn().mockRejectedValue(new Error("Store not found")) };
    const result = await storeHandlers.deleteStore(createMockContext(client), "store-123");
    expect(result).toContain("❌ Failed to delete store");
    expect(result).toContain("Store not found");
  });

  it("prevents store deletion in restricted mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    const client = { deleteStore: vi.fn() };
    const result = await storeHandlers.deleteStore(createMockContext(client), "store-123");
    expect(result).toBe(
      "❌ The MCP server is configured in restricted mode. You cannot delete stores in this mode.",
    );
    expect(client.deleteStore).not.toHaveBeenCalled();
  });

  it("prevents store deletion in read-only mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    const client = { deleteStore: vi.fn() };
    const result = await storeHandlers.deleteStore(createMockContext(client), "store-123");
    expect(result).toContain("delete stores");
  });
});

describe("getStore", () => {
  it("gets store details successfully", async () => {
    setOnlineWritableMode();
    const client = {
      getStore: vi.fn().mockResolvedValue({
        id: "store-123",
        name: "test-store",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        deleted_at: undefined,
      }),
    };
    const result = await storeHandlers.getStore(createMockContext(client), "store-123");
    expect(result).toEqual({
      id: "store-123",
      name: "test-store",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      deleted_at: null,
    });
  });

  it("prevents getting non-restricted store in restricted mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { getStore: vi.fn() };
    const result = await storeHandlers.getStore(createMockContext(client), "different-store");
    expect(result).toContain("allowed-store");
  });

  it("handles get store failure", async () => {
    setOnlineWritableMode();
    const client = { getStore: vi.fn().mockRejectedValue(new Error("Store not found")) };
    const result = await storeHandlers.getStore(createMockContext(client), "store-123");
    expect(result).toContain("❌ Failed to get store");
    expect(result).toContain("Store not found");
  });

  it("allows getting restricted store in restricted mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = {
      getStore: vi.fn().mockResolvedValue({
        id: "allowed-store",
        name: "test",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      }),
    };
    const result = await storeHandlers.getStore(createMockContext(client), "allowed-store");
    expect(result).toEqual(expect.objectContaining({ id: "allowed-store" }));
    expect(client.getStore).toHaveBeenCalledWith({ storeId: "allowed-store" });
  });
});

describe("listStores", () => {
  it("handles list stores failure", async () => {
    setOnlineWritableMode();
    const client = { listStores: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await storeHandlers.listStores(createMockContext(client));
    expect(result).toContain("❌ Failed to list stores");
    expect(result).toContain("Network error");
  });
});
