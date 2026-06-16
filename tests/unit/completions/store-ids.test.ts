import { afterEach, describe, expect, it, vi } from "vitest";
import { completeStoreIds } from "../../../src/completions/index.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("completeStoreIds", () => {
  it("returns empty array in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await completeStoreIds(createOfflineContext(), "");
    expect(result).toEqual([]);
  });

  it("returns empty array when client throws exception", async () => {
    setOnlineWritableMode();
    const client = {
      listStores: vi.fn().mockRejectedValue(new Error("API Error")),
    };
    const result = await completeStoreIds(createMockContext(client), "");
    expect(result).toEqual([]);
  });

  it("returns empty array when client returns null stores", async () => {
    setOnlineWritableMode();
    const client = {
      listStores: vi.fn().mockResolvedValue(null),
    };
    const result = await completeStoreIds(createMockContext(client), "");
    expect(result).toEqual([]);
  });

  it("filters completions based on current value in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await completeStoreIds(createOfflineContext(), "test");
    expect(result).toEqual([]);
  });

  it("handles null client response gracefully", async () => {
    setOnlineWritableMode();
    const client = {
      listStores: vi.fn().mockResolvedValue(null),
    };
    const result = await completeStoreIds(createMockContext(client), "");
    expect(result).toEqual([]);
  });

  it("handles client that throws runtime exception", async () => {
    setOnlineWritableMode();
    const client = {
      listStores: vi.fn().mockRejectedValue(new Error("Empty response")),
    };
    const result = await completeStoreIds(createMockContext(client), "");
    expect(result).toEqual([]);
  });
});
