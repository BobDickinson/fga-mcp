import { afterEach, describe, expect, it, vi } from "vitest";
import { completeRelations } from "../../../src/completions/index.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("completeRelations", () => {
  describe("offline mode", () => {
    it("returns common relations in offline mode", async () => {
      clearOpenFgaEnv();
      const result = await completeRelations(createOfflineContext(), "", "");
      expect(result).toContain("viewer");
      expect(result).toContain("editor");
      expect(result).toContain("owner");
      expect(result).toContain("member");
      expect(result).toContain("admin");
    });

    it("filters common relations in offline mode", async () => {
      clearOpenFgaEnv();
      const ctx = createOfflineContext();
      const viewerResult = await completeRelations(ctx, "", "vie");
      expect(viewerResult).toContain("viewer");
      expect(viewerResult).not.toContain("editor");

      const adminResult = await completeRelations(ctx, "", "ad");
      expect(adminResult).toContain("admin");
      expect(adminResult).not.toContain("viewer");
    });
  });

  describe("store ID handling", () => {
    it("returns common relations when no store ID is available", async () => {
      setOnlineWritableMode();
      const result = await completeRelations(createMockContext({}), "", "");
      expect(result).toContain("viewer");
      expect(result).toContain("editor");
      expect(result).toContain("owner");
    });

    it("returns common relations when store ID exists but API is not called with model", async () => {
      setOnlineWritableMode();
      const client = {
        readAuthorizationModel: vi.fn().mockRejectedValue(new Error("API error")),
      };
      const result = await completeRelations(createMockContext(client), "store-123", "");
      expect(result).toContain("viewer");
      expect(result).toContain("editor");
    });
  });

  describe("API error handling", () => {
    it("handles API failure gracefully", async () => {
      setOnlineWritableMode();
      const client = {
        readAuthorizationModel: vi.fn().mockRejectedValue(new Error("API error")),
      };
      const result = await completeRelations(createMockContext(client), "store-123", "");
      expect(result).toContain("viewer");
    });

    it("handles exception during API call", async () => {
      setOnlineWritableMode();
      const client = {
        readAuthorizationModel: vi.fn().mockRejectedValue(new Error("Connection error")),
      };
      const result = await completeRelations(createMockContext(client), "store-123", "");
      expect(result).toContain("viewer");
    });
  });

  describe("restricted mode", () => {
    it("returns common relations in restricted mode with configured store", async () => {
      setOnlineWritableMode();
      setEnv("OPENFGA_MCP_API_STORE", "restricted-store");
      setEnv("OPENFGA_MCP_API_MODEL", "model-123");
      setEnv("OPENFGA_MCP_API_RESTRICT", "true");
      const client = {
        readAuthorizationModel: vi.fn().mockRejectedValue(new Error("API error")),
      };
      const result = await completeRelations(createMockContext(client), "restricted-store", "");
      expect(result).toContain("viewer");
    });

    it("returns common relations in restricted mode with different model", async () => {
      setOnlineWritableMode();
      setEnv("OPENFGA_MCP_API_STORE", "store-123");
      setEnv("OPENFGA_MCP_API_MODEL", "restricted-model");
      setEnv("OPENFGA_MCP_API_RESTRICT", "true");
      const client = {
        readAuthorizationModel: vi.fn().mockRejectedValue(new Error("API error")),
      };
      const result = await completeRelations(createMockContext(client), "store-123", "");
      expect(result).toContain("viewer");
    });
  });

  describe("filtering", () => {
    it("filters relations based on current value", async () => {
      setOnlineWritableMode();
      const ctx = createMockContext({});
      const ownerResult = await completeRelations(ctx, "", "own");
      expect(ownerResult).toContain("owner");
      expect(ownerResult).not.toContain("viewer");

      const editorResult = await completeRelations(ctx, "", "edit");
      expect(editorResult).toContain("editor");
      expect(editorResult).not.toContain("owner");
    });
  });

  describe("edge cases", () => {
    it("handles empty current value", async () => {
      setOnlineWritableMode();
      const result = await completeRelations(createMockContext({}), "", "");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles special characters in current value", async () => {
      setOnlineWritableMode();
      const result = await completeRelations(createMockContext({}), "", "view_er");
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
