import { afterEach, describe, expect, it, vi } from "vitest";
import * as relationshipResources from "../../../src/resources/handlers/relationship.js";
import { createOfflineContext } from "../../helpers/mock-client.js";
import { targetFrom } from "../../helpers/resource-target.js";
import { resolveResourceTarget } from "../../../src/resource-resolver.js";
import { clearOpenFgaEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("listUsers resource", () => {
  it("handles read failure", async () => {
    setOnlineWritableMode();
    const client = { read: vi.fn().mockRejectedValue(new Error("Failed to read tuples")) };
    const result = await relationshipResources.listUsers(targetFrom(client), "test-store-id");
    expect(result.error).toContain("Failed to read tuples");
  });
});

describe("listObjects resource", () => {
  it("handles read failure", async () => {
    setOnlineWritableMode();
    const client = { read: vi.fn().mockRejectedValue(new Error("Failed to read tuples")) };
    const result = await relationshipResources.listObjects(targetFrom(client), "test-store-id");
    expect(result.error).toContain("Failed to read tuples");
  });
});

describe("listRelationships resource", () => {
  it("handles read failure", async () => {
    setOnlineWritableMode();
    const client = { read: vi.fn().mockRejectedValue(new Error("Failed to read tuples")) };
    const result = await relationshipResources.listRelationships(targetFrom(client), "test-store-id");
    expect(result.error).toContain("Failed to read tuples");
  });
});

describe("checkPermission resource", () => {
  it("returns check result", async () => {
    setOnlineWritableMode();
    const client = { check: vi.fn().mockResolvedValue({ allowed: true, resolution: "" }) };
    const result = await relationshipResources.checkPermission(
      targetFrom(client),
      "test-store-id",
      "user:alice",
      "writer",
      "document:budget",
    );
    expect(result.allowed).toBe(true);
    expect(result.user).toBe("user:alice");
  });

  it("handles check errors", async () => {
    setOnlineWritableMode();
    const client = { check: vi.fn().mockRejectedValue(new Error("Check failed")) };
    const result = await relationshipResources.checkPermission(
      targetFrom(client),
      "test-store-id",
      "user:alice",
      "writer",
      "document:budget",
    );
    expect(result.error).toContain("Failed to check permission");
  });
});

describe("expandRelationships resource", () => {
  it("returns expanded users", async () => {
    setOnlineWritableMode();
    const client = {
      expand: vi.fn().mockResolvedValue({
        tree: { root: { leaf: { users: { users: [{ object: "user:alice" }] } } } },
      }),
    };
    const result = await relationshipResources.expandRelationships(
      targetFrom(client),
      "test-store-id",
      "document:budget",
      "reader",
    );
    expect(result.users).toEqual(["user:alice"]);
    expect(result.count).toBe(1);
  });

  it("handles expand errors", async () => {
    setOnlineWritableMode();
    const client = { expand: vi.fn().mockRejectedValue(new Error("Expand failed")) };
    const result = await relationshipResources.expandRelationships(
      targetFrom(client),
      "test-store-id",
      "document:budget",
      "reader",
    );
    expect(result.error).toContain("Failed to expand relationships");
  });
});

describe("offline mode behavior", () => {
  it("resolveResourceTarget returns error when offline", () => {
    clearOpenFgaEnv();
    const result = resolveResourceTarget(createOfflineContext(), { storeId: "test-store-id" });
    expect(result).toEqual({
      error: "❌ Resource requires a live OpenFGA instance. Configure FGA servers via --config or use connect_server.",
    });
  });
});
