import { describe, expect, it } from "vitest";
import * as relationshipResources from "../../../src/resources/handlers/relationship.js";
import * as relationshipHandlers from "../../../src/tools/handlers/relationship.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { createTestModel, getTestClient, setupTestStore, setupTestStoreWithModel } from "../helpers.js";

function ctx() {
  return createMockContext(getTestClient());
}

const BASIC_DSL = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]
    define writer: [user]`;

describe("RelationshipResources Integration", () => {
  it("lists users from relationships", async () => {
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(BASIC_DSL);

    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "reader", "document:1");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:bob", "writer", "document:1");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "writer", "document:2");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:charlie", "reader", "document:3");

    const result = await relationshipResources.listUsers(ctx(), storeId);
    expect(result.store_id).toBe(storeId);
    expect(result.users).toContain("user:alice");
    expect(result.users).toContain("user:bob");
    expect(result.users).toContain("user:charlie");
    expect(result.count).toBe(3);
  });

  it("lists objects from relationships", async () => {
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(BASIC_DSL);

    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "reader", "document:report");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:bob", "reader", "document:budget");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:charlie", "reader", "document:report");

    const result = await relationshipResources.listObjects(ctx(), storeId);
    expect(result.store_id).toBe(storeId);
    expect(result.objects).toContain("document:report");
    expect(result.objects).toContain("document:budget");
    expect(result.count).toBe(2);
  });

  it("lists all relationships", async () => {
    const dsl = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]`;
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(dsl);

    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "reader", "document:1");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:bob", "reader", "document:2");

    const result = await relationshipResources.listRelationships(ctx(), storeId);
    expect(result.store_id).toBe(storeId);
    expect(result.relationships).toHaveLength(2);
    expect((result.relationships as Array<{ user: string }>)[0].user).toBe("user:alice");
    expect((result.relationships as Array<{ relation: string }>)[0].relation).toBe("reader");
    expect((result.relationships as Array<{ object: string }>)[0].object).toBe("document:1");
    expect(result.count).toBe(2);
  });

  it("checks permissions using resource template", async () => {
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(BASIC_DSL);

    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "reader", "document:budget");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "writer", "document:budget");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:bob", "reader", "document:budget");

    const allowed = await relationshipResources.checkPermission(
      ctx(), storeId, "user:alice", "writer", "document:budget", modelId,
    );
    expect(allowed.allowed).toBe(true);
    expect(allowed.user).toBe("user:alice");
    expect(allowed.relation).toBe("writer");
    expect(allowed.object).toBe("document:budget");

    const denied = await relationshipResources.checkPermission(
      ctx(), storeId, "user:bob", "writer", "document:budget", modelId,
    );
    expect(denied.allowed).toBe(false);
  });

  it("expands relationships using resource template", async () => {
    const dsl = `model
  schema 1.1
type user
type group
  relations
    define member: [user]
type document
  relations
    define reader: [user, group#member]`;
    const { store: storeId, model: modelId } = await setupTestStoreWithModel(dsl);

    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:alice", "reader", "document:report");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "user:bob", "member", "group:engineering");
    await relationshipHandlers.grantPermission(ctx(), storeId, modelId, "group:engineering#member", "reader", "document:report");

    const result = await relationshipResources.expandRelationships(ctx(), storeId, "document:report", "reader");
    expect(result.object).toBe("document:report");
    expect(result.relation).toBe("reader");
    expect(result.users).toContain("user:alice");
  });

  it("handles empty store gracefully", async () => {
    const storeId = await setupTestStore();

    const usersResult = await relationshipResources.listUsers(ctx(), storeId);
    expect(usersResult.users).toEqual([]);
    expect(usersResult.count).toBe(0);

    const objectsResult = await relationshipResources.listObjects(ctx(), storeId);
    expect(objectsResult.objects).toEqual([]);
    expect(objectsResult.count).toBe(0);
  });
});
