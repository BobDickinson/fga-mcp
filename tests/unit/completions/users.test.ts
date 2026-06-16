import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMON_USER_PATTERNS, completeFromTuples } from "../../../src/completions/index.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("completeFromTuples (user)", () => {
  it("returns common user patterns when no store ID available", async () => {
    setOnlineWritableMode();
    const result = await completeFromTuples(createMockContext({}), "", "user", "", COMMON_USER_PATTERNS);
    expect(result).toContain("user:alice");
    expect(result).toContain("user:bob");
    expect(result).toContain("group:admins");
    expect(result).toContain("service:api");
  });

  it("filters completions based on current value", async () => {
    setOnlineWritableMode();
    const result = await completeFromTuples(createMockContext({}), "", "user", "user:", COMMON_USER_PATTERNS);
    expect(result).toContain("user:alice");
    expect(result).toContain("user:bob");
    expect(result).not.toContain("group:admins");
    expect(result).not.toContain("service:api");
  });

  it("returns common patterns in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await completeFromTuples(createOfflineContext(), "", "user", "", COMMON_USER_PATTERNS);
    expect(result).toContain("user:alice");
    expect(result).toContain("user:bob");
    expect(result).toContain("group:admins");
  });

  it("extracts users from tuples when store ID is provided", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockResolvedValue({
        tuples: [
          { key: { user: "user:john.doe", relation: "viewer", object: "document:1" } },
          { key: { user: "service-account:api-service", relation: "editor", object: "document:2" } },
        ],
      }),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "user", "", COMMON_USER_PATTERNS);
    expect(result).toContain("user:john.doe");
    expect(result).toContain("service-account:api-service");
  });

  it("handles API failure gracefully", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockRejectedValue(new Error("API error")),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "user", "", COMMON_USER_PATTERNS);
    expect(result).toContain("user:alice");
    expect(result).toContain("group:admins");
  });

  it("handles exceptions during API call", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockRejectedValue(new Error("API error")),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "user", "", COMMON_USER_PATTERNS);
    expect(result).toContain("user:alice");
    expect(result).toContain("group:admins");
  });

  it("returns empty in restricted mode when store ID is provided", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_STORE", "restricted-store");
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    const client = { read: vi.fn() };
    const result = await completeFromTuples(createMockContext(client), "other-store", "user", "", COMMON_USER_PATTERNS);
    expect(result).toEqual([]);
    expect(client.read).not.toHaveBeenCalled();
  });

  it("deduplicates and sorts completions from tuples", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockResolvedValue({
        tuples: [
          { key: { user: "user:alice", relation: "viewer", object: "document:1" } },
          { key: { user: "user:alice", relation: "editor", object: "document:2" } },
          { key: { user: "user:bob", relation: "viewer", object: "document:3" } },
        ],
      }),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "user", "", COMMON_USER_PATTERNS);
    expect(result).toEqual(["user:alice", "user:bob"]);
  });

  it("handles empty tuple response", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockResolvedValue({ tuples: [] }),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "user", "", COMMON_USER_PATTERNS);
    expect(result).toContain("user:alice");
    expect(result).toContain("group:admins");
  });

  it("filters users by prefix correctly", async () => {
    setOnlineWritableMode();
    const client = {
      read: vi.fn().mockResolvedValue({
        tuples: [
          { key: { user: "user:john", relation: "viewer", object: "document:1" } },
          { key: { user: "service-account:api", relation: "admin", object: "system:1" } },
          { key: { user: "user:jane", relation: "editor", object: "document:2" } },
        ],
      }),
    };
    const result = await completeFromTuples(createMockContext(client), "store123", "user", "user:", COMMON_USER_PATTERNS);
    expect(result).toContain("user:john");
    expect(result).toContain("user:jane");
    expect(result).not.toContain("service-account:api");
  });
});
