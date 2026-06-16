import { afterEach, describe, expect, it, vi } from "vitest";
import { completeModelIds } from "../../../src/completions/index.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("completeModelIds", () => {
  describe("offline mode", () => {
    it("returns only latest in offline mode", async () => {
      clearOpenFgaEnv();
      const result = await completeModelIds(createOfflineContext(), "store-123", "");
      expect(result).toEqual(["latest"]);
    });

    it("filters latest in offline mode based on current value", async () => {
      clearOpenFgaEnv();
      const ctx = createOfflineContext();
      expect(await completeModelIds(ctx, "store-123", "lat")).toEqual(["latest"]);
      expect(await completeModelIds(ctx, "store-123", "xyz")).toEqual([]);
    });
  });

  describe("store ID handling", () => {
    it("returns only latest when no store ID is available", async () => {
      setOnlineWritableMode();
      const result = await completeModelIds(createMockContext({}), "", "");
      expect(result).toEqual(["latest"]);
    });

    it("handles API failure gracefully", async () => {
      setOnlineWritableMode();
      const client = {
        readAuthorizationModels: vi.fn().mockRejectedValue(new Error("API error")),
      };
      const result = await completeModelIds(createMockContext(client), "store-123", "");
      expect(result).toEqual(["latest"]);
    });
  });

  describe("filtering", () => {
    it("filters completions based on current value", async () => {
      setOnlineWritableMode();
      const ctx = createMockContext({});
      expect(await completeModelIds(ctx, "", "la")).toEqual(["latest"]);
      expect(await completeModelIds(ctx, "", "test")).toEqual([]);
    });
  });

  describe("restricted mode", () => {
    it("returns empty in restricted mode", async () => {
      setOnlineWritableMode();
      setEnv("OPENFGA_MCP_API_STORE", "restricted-store");
      setEnv("OPENFGA_MCP_API_RESTRICT", "true");
      const result = await completeModelIds(createMockContext({}), "restricted-store", "");
      expect(result).toEqual([]);
    });

    it("returns empty for configured store in restricted mode", async () => {
      setOnlineWritableMode();
      setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
      setEnv("OPENFGA_MCP_API_RESTRICT", "true");
      const result = await completeModelIds(createMockContext({}), "allowed-store", "");
      expect(result).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles exception during API call", async () => {
      setOnlineWritableMode();
      const client = {
        readAuthorizationModels: vi.fn().mockRejectedValue(new Error("Connection error")),
      };
      const result = await completeModelIds(createMockContext(client), "store-123", "");
      expect(result).toEqual(["latest"]);
    });

    it("handles null store ID gracefully", async () => {
      setOnlineWritableMode();
      const result = await completeModelIds(createMockContext({}), "", "");
      expect(result).toContain("latest");
    });
  });
});
