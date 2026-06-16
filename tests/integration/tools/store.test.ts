import { afterEach, describe, expect, it } from "vitest";
import * as storeHandlers from "../../../src/tools/handlers/store.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";
import {
  createTestStore,
  deleteTestStore,
  getTestClient,
} from "../helpers.js";

function ctx() {
  return createMockContext(getTestClient());
}

afterEach(() => {
  clearOpenFgaEnv();
  process.env.OPENFGA_MCP_API_URL = process.env.OPENFGA_MCP_API_URL ?? "http://localhost:8080";
  process.env.OPENFGA_MCP_API_WRITEABLE = "true";
});

describe("StoreTools Integration", () => {
  it("can create a store", async () => {
    const storeName = `integration-test-store-${Date.now()}`;
    const result = await storeHandlers.createStore(ctx(), storeName);
    expect(result).toContain("✅ Successfully created store");
    expect(result).toContain(storeName);

    const match = result.match(/please use the ID ([a-zA-Z0-9-]+)/);
    expect(match?.[1]).toBeTruthy();
    await deleteTestStore(match![1]);
  });

  it("can list stores", async () => {
    const storeId1 = await createTestStore("list-test-1");
    const storeId2 = await createTestStore("list-test-2");

    const result = await storeHandlers.listStores(ctx());
    expect(Array.isArray(result)).toBe(true);
    const ids = (result as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(storeId1);
    expect(ids).toContain(storeId2);

    await deleteTestStore(storeId1);
    await deleteTestStore(storeId2);
  });

  it("can get store details", async () => {
    const storeName = "get-test-store";
    const storeId = await createTestStore(storeName);

    const result = await storeHandlers.getStore(ctx(), storeId);
    expect(result).toEqual(expect.objectContaining({
      id: storeId,
      name: storeName,
      deleted_at: null,
    }));

    await deleteTestStore(storeId);
  });

  it("can delete a store", async () => {
    const storeId = await createTestStore("delete-test-store");

    const beforeDelete = await storeHandlers.getStore(ctx(), storeId);
    expect(beforeDelete).toEqual(expect.objectContaining({ id: storeId }));

    const result = await storeHandlers.deleteStore(ctx(), storeId);
    expect(result).toBe("✅ Successfully deleted store!");

    const afterDelete = await storeHandlers.getStore(ctx(), storeId);
    expect(typeof afterDelete).toBe("string");
    expect(afterDelete as string).toContain("Failed to get store");
  });

  it("handles non-existent store gracefully", async () => {
    const result = await storeHandlers.getStore(ctx(), "00000000-0000-0000-0000-000000000000");
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Failed to get store");
  });

  it("respects read-only mode", async () => {
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    const result = await storeHandlers.createStore(ctx(), "should-not-create");
    expect(result).toBe("❌ Write operations are disabled for safety. To enable create stores, set OPENFGA_MCP_API_WRITEABLE=true.");
  });

  it("respects restricted mode for store access", async () => {
    const allowedStoreId = await createTestStore("allowed-store");
    const restrictedStoreId = await createTestStore("restricted-store");

    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", allowedStoreId);

    const allowedResult = await storeHandlers.getStore(ctx(), allowedStoreId);
    expect(allowedResult).toEqual(expect.objectContaining({ id: allowedStoreId }));

    const restrictedResult = await storeHandlers.getStore(ctx(), restrictedStoreId);
    expect(restrictedResult).toBe(`❌ The MCP server is configured in restricted mode. You cannot query stores other than ${allowedStoreId} in this mode.`);

    await deleteTestStore(allowedStoreId);
    await deleteTestStore(restrictedStoreId);
  });
});
