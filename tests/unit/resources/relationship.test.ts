import { afterEach, describe, expect, it, vi } from "vitest";
import * as relationshipResources from "../../../src/resources/handlers/relationship.js";
import { createMockContext, createOfflineContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setOnlineWritableMode } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("listUsers resource", () => {
  it("handles read failure", async () => {
    setOnlineWritableMode();
    const client = { read: vi.fn().mockRejectedValue(new Error("Failed to read tuples")) };
    const result = await relationshipResources.listUsers(createMockContext(client), "test-store-id");
    expect(result.error).toContain("Failed to read tuples");
  });
});

describe("listObjects resource", () => {
  it("handles read failure", async () => {
    setOnlineWritableMode();
    const client = { read: vi.fn().mockRejectedValue(new Error("Failed to read tuples")) };
    const result = await relationshipResources.listObjects(createMockContext(client), "test-store-id");
    expect(result.error).toContain("Failed to read tuples");
  });
});

describe("listRelationships resource", () => {
  it("handles read failure", async () => {
    setOnlineWritableMode();
    const client = { read: vi.fn().mockRejectedValue(new Error("Failed to read tuples")) };
    const result = await relationshipResources.listRelationships(createMockContext(client), "test-store-id");
    expect(result.error).toContain("Failed to read tuples");
  });
});

describe("checkPermission resource", () => {
  it("returns check result", async () => {
    setOnlineWritableMode();
    const client = { check: vi.fn().mockResolvedValue({ allowed: true, resolution: "" }) };
    const result = await relationshipResources.checkPermission(
      createMockContext(client),
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
      createMockContext(client),
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
      createMockContext(client),
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
      createMockContext(client),
      "test-store-id",
      "document:budget",
      "reader",
    );
    expect(result.error).toContain("Failed to expand relationships");
  });
});

describe("offline mode behavior", () => {
  it("prevents checkPermission in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await relationshipResources.checkPermission(
      createOfflineContext(),
      "test-store-id",
      "user:123",
      "reader",
      "document:456",
    );
    expect(result.error).toContain("Checking permission requires a live OpenFGA instance");
  });

  it("prevents expandRelationships in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await relationshipResources.expandRelationships(
      createOfflineContext(),
      "test-store-id",
      "document:456",
      "reader",
    );
    expect(result.error).toContain("Expanding relationships requires a live OpenFGA instance");
  });

  it("prevents listObjects in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await relationshipResources.listObjects(createOfflineContext(), "test-store-id");
    expect(result.error).toContain("Listing objects requires a live OpenFGA instance");
  });

  it("prevents listRelationships in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await relationshipResources.listRelationships(createOfflineContext(), "test-store-id");
    expect(result.error).toContain("Listing relationships requires a live OpenFGA instance");
  });

  it("prevents listUsers in offline mode", async () => {
    clearOpenFgaEnv();
    const result = await relationshipResources.listUsers(createOfflineContext(), "test-store-id");
    expect(result.error).toContain("Listing users requires a live OpenFGA instance");
  });
});
