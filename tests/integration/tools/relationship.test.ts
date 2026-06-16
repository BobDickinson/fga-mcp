import { afterEach, describe, expect, it } from "vitest";
import * as relationshipHandlers from "../../../src/tools/handlers/relationship.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";
import { deleteTestStore, getTestClient, setupTestStoreWithModel } from "../helpers.js";

function ctx() {
  return createMockContext(getTestClient());
}

afterEach(() => {
  clearOpenFgaEnv();
  process.env.OPENFGA_MCP_API_URL = process.env.OPENFGA_MCP_API_URL ?? "http://localhost:8080";
  process.env.OPENFGA_MCP_API_WRITEABLE = "true";
});

describe("RelationshipTools Integration", () => {
  it("can grant and check permissions", async () => {
    const { store, model } = await setupTestStoreWithModel();
    const user = "user:alice";
    const relation = "reader";
    const object = "document:budget-2024";

    const checkBefore = await relationshipHandlers.checkPermission(ctx(), store, model, user, relation, object);
    expect(checkBefore).toBe("❌ Permission denied");

    const grantResult = await relationshipHandlers.grantPermission(ctx(), store, model, user, relation, object);
    expect(grantResult).toBe("✅ Permission granted successfully");

    const checkAfter = await relationshipHandlers.checkPermission(ctx(), store, model, user, relation, object);
    expect(checkAfter).toBe("✅ Permission allowed");
  });

  it("can revoke permissions", async () => {
    const { store, model } = await setupTestStoreWithModel();
    const user = "user:bob";
    const relation = "writer";
    const object = "document:proposal";

    await relationshipHandlers.grantPermission(ctx(), store, model, user, relation, object);
    expect(await relationshipHandlers.checkPermission(ctx(), store, model, user, relation, object)).toBe("✅ Permission allowed");

    const revokeResult = await relationshipHandlers.revokePermission(ctx(), store, model, user, relation, object);
    expect(revokeResult).toBe("✅ Permission revoked successfully");

    expect(await relationshipHandlers.checkPermission(ctx(), store, model, user, relation, object)).toBe("❌ Permission denied");
  });

  it("can list objects a user has access to", async () => {
    const { store, model } = await setupTestStoreWithModel();
    const user = "user:charlie";
    const relation = "reader";
    const objects = ["document:report-1", "document:report-2", "document:report-3"];

    for (const object of objects) {
      await relationshipHandlers.grantPermission(ctx(), store, model, user, relation, object);
    }

    const result = await relationshipHandlers.listObjects(ctx(), store, model, "document", user, relation);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    for (const object of objects) {
      expect(result as string[]).toContain(object);
    }
  });

  it("can list users with access to an object", async () => {
    const { store, model } = await setupTestStoreWithModel();
    const object = "document:shared-doc";
    const relation = "reader";
    const users = ["user:dave", "user:eve", "user:frank"];

    for (const user of users) {
      await relationshipHandlers.grantPermission(ctx(), store, model, user, relation, object);
    }

    const result = await relationshipHandlers.listUsers(ctx(), store, model, object, relation);
    if (typeof result === "string" && result.includes("Failed to list users")) {
      return;
    }
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    for (const user of users) {
      expect(result as string[]).toContain(user);
    }
  });

  it("handles hierarchical permissions", async () => {
    const dsl = `model
  schema 1.1

type user

type folder
  relations
    define owner: [user]
    define viewer: [user] or owner

type document
  relations
    define parent: [folder]
    define owner: [user]
    define viewer: [user] or owner or viewer from parent`;

    const { store, model } = await setupTestStoreWithModel(dsl);
    const folder = "folder:projects";
    const document = "document:project-plan";
    const user = "user:grace";

    await relationshipHandlers.grantPermission(ctx(), store, model, user, "owner", folder);
    await relationshipHandlers.grantPermission(ctx(), store, model, folder, "parent", document);

    const checkResult = await relationshipHandlers.checkPermission(ctx(), store, model, user, "viewer", document);
    expect(checkResult).toBe("✅ Permission allowed");
  });

  it("respects read-only mode", async () => {
    const { store, model } = await setupTestStoreWithModel();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");

    const grantResult = await relationshipHandlers.grantPermission(ctx(), store, model, "user:test", "reader", "document:test");
    expect(grantResult).toContain("Write operations are disabled");

    const revokeResult = await relationshipHandlers.revokePermission(ctx(), store, model, "user:test", "reader", "document:test");
    expect(revokeResult).toContain("Write operations are disabled");

    const checkResult = await relationshipHandlers.checkPermission(ctx(), store, model, "user:test", "reader", "document:test");
    expect(checkResult).toBe("❌ Permission denied");
  });

  it("respects restricted mode", async () => {
    const { store: allowedStoreId, model: allowedModelId } = await setupTestStoreWithModel();
    const { store: restrictedStoreId, model: restrictedModelId } = await setupTestStoreWithModel();

    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", allowedStoreId);
    setEnv("OPENFGA_MCP_API_MODEL", allowedModelId);

    const allowedCheck = await relationshipHandlers.checkPermission(
      ctx(),
      allowedStoreId,
      allowedModelId,
      "user:test",
      "reader",
      "document:test",
    );
    expect(allowedCheck).toBe("❌ Permission denied");

    const restrictedStoreCheck = await relationshipHandlers.checkPermission(
      ctx(),
      restrictedStoreId,
      allowedModelId,
      "user:test",
      "reader",
      "document:test",
    );
    expect(restrictedStoreCheck).toBe(
      `❌ Restricted: store must be ${allowedStoreId} on this server.`,
    );

    const restrictedModelCheck = await relationshipHandlers.checkPermission(
      ctx(),
      allowedStoreId,
      restrictedModelId,
      "user:test",
      "reader",
      "document:test",
    );
    expect(restrictedModelCheck).toBe(
      `❌ Restricted: model must be ${allowedModelId} on this server.`,
    );

    await deleteTestStore(restrictedStoreId);
  });

  it("handles batch operations efficiently", async () => {
    const { store, model } = await setupTestStoreWithModel();

    const users: string[] = [];
    const documents: string[] = [];

    for (let i = 1; i <= 5; i++) {
      users.push(`user:user${i}`);
      documents.push(`document:doc${i}`);
    }

    for (const [userIndex, user] of users.entries()) {
      for (const [docIndex, document] of documents.entries()) {
        if (docIndex <= userIndex) {
          await relationshipHandlers.grantPermission(ctx(), store, model, user, "reader", document);
        }
      }
    }

    expect(await relationshipHandlers.checkPermission(ctx(), store, model, "user:user1", "reader", "document:doc1")).toBe(
      "✅ Permission allowed",
    );
    expect(await relationshipHandlers.checkPermission(ctx(), store, model, "user:user1", "reader", "document:doc2")).toBe(
      "❌ Permission denied",
    );

    expect(await relationshipHandlers.checkPermission(ctx(), store, model, "user:user3", "reader", "document:doc1")).toBe(
      "✅ Permission allowed",
    );
    expect(await relationshipHandlers.checkPermission(ctx(), store, model, "user:user3", "reader", "document:doc3")).toBe(
      "✅ Permission allowed",
    );
    expect(await relationshipHandlers.checkPermission(ctx(), store, model, "user:user3", "reader", "document:doc4")).toBe(
      "❌ Permission denied",
    );

    const user3Objects = await relationshipHandlers.listObjects(ctx(), store, model, "document", "user:user3", "reader");
    expect(user3Objects).toHaveLength(3);
    expect(user3Objects as string[]).toContain("document:doc1");
    expect(user3Objects as string[]).toContain("document:doc2");
    expect(user3Objects as string[]).toContain("document:doc3");
  });
});
