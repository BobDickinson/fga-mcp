import { afterEach, describe, expect, it, vi } from "vitest";
import * as relationshipHandlers from "../../../src/tools/handlers/relationship.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setOnlineWritableMode, setEnv } from "../../helpers/env.js";

const STORE = "store-123";
const MODEL = "model-456";
const USER = "user:1";
const RELATION = "reader";
const OBJECT = "document:1";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("checkPermission", () => {
  it("returns allowed", async () => {
    setOnlineWritableMode();
    const client = { check: vi.fn().mockResolvedValue({ allowed: true }) };
    const result = await relationshipHandlers.checkPermission(createMockContext(client), STORE, MODEL, USER, RELATION, OBJECT);
    expect(result).toBe("✅ Permission allowed");
  });

  it("returns denied", async () => {
    setOnlineWritableMode();
    const client = { check: vi.fn().mockResolvedValue({ allowed: false }) };
    const result = await relationshipHandlers.checkPermission(createMockContext(client), STORE, MODEL, USER, RELATION, OBJECT);
    expect(result).toBe("❌ Permission denied");
  });

  it("handles check failure", async () => {
    setOnlineWritableMode();
    const client = { check: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await relationshipHandlers.checkPermission(createMockContext(client), STORE, MODEL, USER, RELATION, OBJECT);
    expect(result).toContain("Failed to check permission");
  });

  it("prevents checking permission with non-restricted store", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { check: vi.fn() };
    const result = await relationshipHandlers.checkPermission(
      createMockContext(client),
      "different-store",
      MODEL,
      USER,
      RELATION,
      OBJECT,
    );
    expect(result).toContain("allowed-store");
    expect(client.check).not.toHaveBeenCalled();
  });

  it("prevents checking permission with non-restricted model", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    const client = { check: vi.fn() };
    const result = await relationshipHandlers.checkPermission(
      createMockContext(client),
      STORE,
      "different-model",
      USER,
      RELATION,
      OBJECT,
    );
    expect(result).toContain("allowed-model");
    expect(client.check).not.toHaveBeenCalled();
  });
});

describe("grantPermission", () => {
  it("grants permission successfully", async () => {
    setOnlineWritableMode();
    const client = { writeTuples: vi.fn().mockResolvedValue(undefined) };
    const result = await relationshipHandlers.grantPermission(createMockContext(client), STORE, MODEL, USER, RELATION, OBJECT);
    expect(result).toBe("✅ Permission granted successfully");
  });

  it("prevents grant in read-only mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    const client = { writeTuples: vi.fn() };
    const result = await relationshipHandlers.grantPermission(createMockContext(client), STORE, MODEL, USER, RELATION, OBJECT);
    expect(result).toContain("grant permissions");
  });

  it("handles grant permission failure", async () => {
    setOnlineWritableMode();
    const client = { writeTuples: vi.fn().mockRejectedValue(new Error("Invalid tuple")) };
    const result = await relationshipHandlers.grantPermission(
      createMockContext(client),
      STORE,
      MODEL,
      USER,
      "writer",
      OBJECT,
    );
    expect(result).toContain("❌ Failed to grant permission");
    expect(result).toContain("Invalid tuple");
  });

  it("prevents granting permission with non-restricted store", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { writeTuples: vi.fn() };
    const result = await relationshipHandlers.grantPermission(
      createMockContext(client),
      "different-store",
      MODEL,
      USER,
      "writer",
      OBJECT,
    );
    expect(result).toContain("allowed-store");
    expect(client.writeTuples).not.toHaveBeenCalled();
  });
});

describe("revokePermission", () => {
  it("revokes permission successfully", async () => {
    setOnlineWritableMode();
    const client = { deleteTuples: vi.fn().mockResolvedValue(undefined) };
    const result = await relationshipHandlers.revokePermission(createMockContext(client), STORE, MODEL, USER, RELATION, OBJECT);
    expect(result).toBe("✅ Permission revoked successfully");
  });

  it("prevents revoking permission in read-only mode", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    const client = { deleteTuples: vi.fn() };
    const result = await relationshipHandlers.revokePermission(
      createMockContext(client),
      STORE,
      MODEL,
      USER,
      "writer",
      OBJECT,
    );
    expect(result).toBe(
      "❌ Write operations are disabled for safety. To enable revoke permissions, set OPENFGA_MCP_API_WRITEABLE=true.",
    );
    expect(client.deleteTuples).not.toHaveBeenCalled();
  });
});

describe("listObjects", () => {
  it("lists objects", async () => {
    setOnlineWritableMode();
    const client = { listObjects: vi.fn().mockResolvedValue({ objects: ["document:1", "document:2"] }) };
    const result = await relationshipHandlers.listObjects(createMockContext(client), STORE, MODEL, "document", USER, RELATION);
    expect(result).toEqual(["document:1", "document:2"]);
  });

  it("handles list objects failure", async () => {
    setOnlineWritableMode();
    const client = { listObjects: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await relationshipHandlers.listObjects(
      createMockContext(client),
      STORE,
      MODEL,
      "document",
      USER,
      RELATION,
    );
    expect(result).toContain("❌ Failed to list objects");
    expect(result).toContain("Network error");
  });

  it("prevents listing objects with non-restricted store", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { listObjects: vi.fn() };
    const result = await relationshipHandlers.listObjects(
      createMockContext(client),
      "different-store",
      MODEL,
      "document",
      USER,
      RELATION,
    );
    expect(result).toContain("allowed-store");
    expect(client.listObjects).not.toHaveBeenCalled();
  });
});

describe("listUsers", () => {
  it("lists users", async () => {
    setOnlineWritableMode();
    const client = {
      listUsers: vi.fn().mockResolvedValue({
        users: [{ object: "user:alice" }, { object: { type: "user", id: "bob" } }],
      }),
    };
    const result = await relationshipHandlers.listUsers(createMockContext(client), STORE, MODEL, OBJECT, RELATION);
    expect(result).toEqual(["user:alice", "user:bob"]);
  });

  it("handles list users failure", async () => {
    setOnlineWritableMode();
    const client = { listUsers: vi.fn().mockRejectedValue(new Error("Network error")) };
    const result = await relationshipHandlers.listUsers(createMockContext(client), STORE, MODEL, OBJECT, RELATION);
    expect(result).toContain("❌ Failed to list users");
    expect(result).toContain("Network error");
  });

  it("prevents listing users with non-restricted model", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    const client = { listUsers: vi.fn() };
    const result = await relationshipHandlers.listUsers(
      createMockContext(client),
      STORE,
      "different-model",
      OBJECT,
      RELATION,
    );
    expect(result).toContain("allowed-model");
    expect(client.listUsers).not.toHaveBeenCalled();
  });

  it("prevents listing users with non-restricted store", async () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const client = { listUsers: vi.fn() };
    const result = await relationshipHandlers.listUsers(
      createMockContext(client),
      "different-store",
      MODEL,
      OBJECT,
      RELATION,
    );
    expect(result).toContain("allowed-store");
    expect(client.listUsers).not.toHaveBeenCalled();
  });
});
