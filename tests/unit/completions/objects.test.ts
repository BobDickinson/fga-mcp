import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMON_OBJECT_PATTERNS, completeFromTuples } from "../../../src/completions/index.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("completeFromTuples (object)", () => {
  it("returns common object patterns when no store ID available", async () => {
    setOnlineWritableMode();
    const result = await completeFromTuples(createMockContext({}), "", "object", "", COMMON_OBJECT_PATTERNS);
    expect(result).toContain("document:");
    expect(result).toContain("folder:");
    expect(result).toContain("project:");
    expect(result).toContain("organization:");
    expect(result).toContain("team:");
  });

  it("filters completions based on current value", async () => {
    setOnlineWritableMode();
    const result = await completeFromTuples(createMockContext({}), "", "object", "doc", COMMON_OBJECT_PATTERNS);
    expect(result).toContain("document:");
    expect(result).not.toContain("folder:");
    expect(result).not.toContain("project:");
  });

  it("returns common patterns in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await completeFromTuples(createOfflineContext(), "", "object", "", COMMON_OBJECT_PATTERNS);
    expect(result).toContain("document:");
    expect(result).toContain("folder:");
  });

  it("handles API failure gracefully", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockRejectedValue(new Error("API error")),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "object", "", COMMON_OBJECT_PATTERNS);
    expect(result).toContain("document:");
  });

  it("handles exceptions during API call", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockRejectedValue(new Error("API error")),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "object", "", COMMON_OBJECT_PATTERNS);
    expect(result).toContain("document:");
  });

  it("returns empty in restricted mode when store ID is provided", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_STORE", "restricted-store");
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    const client = { read: vi.fn() };
    const result = await completeFromTuples(createMockContext(client), "restricted-store", "object", "", COMMON_OBJECT_PATTERNS);
    expect(result).toEqual([]);
    expect(client.read).not.toHaveBeenCalled();
  });

  it("handles empty tuple response", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockResolvedValue({ tuples: [] }),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "object", "", COMMON_OBJECT_PATTERNS);
    expect(result).toContain("document:");
  });
});
