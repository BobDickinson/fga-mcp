import { OpenFgaClient } from "@openfga/sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  COMMON_OBJECT_PATTERNS,
  COMMON_USER_PATTERNS,
  completeFromTuples,
  completeModelIds,
  completeRelations,
  completeStoreIds,
} from "../../../src/completions/index.js";
import { createMockContext } from "../../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";
import {
  createTestStore,
  deleteTestStore,
  getTestClient,
  setupTestStoreWithModel,
  writeTestTuples,
} from "../helpers.js";

function ctx() {
  return createMockContext(getTestClient());
}

afterEach(() => {
  clearOpenFgaEnv();
  process.env.OPENFGA_MCP_API_URL = process.env.OPENFGA_MCP_API_URL ?? "http://localhost:8080";
  process.env.OPENFGA_MCP_API_WRITEABLE = "true";
});

describe("Completion Providers Integration", () => {
  describe("StoreIdCompletionProvider", () => {
    it("can fetch real store IDs", async () => {
      const store1 = await createTestStore("integration-test-store-1");
      const store2 = await createTestStore("integration-test-store-2");

      const completions = await completeStoreIds(ctx(), "");
      expect(completions).toContain(store1);
      expect(completions).toContain(store2);

      await deleteTestStore(store1);
      await deleteTestStore(store2);
    });

    it("filters completions by current value", async () => {
      const store1 = await createTestStore("filter-test-store-1");
      const store2 = await createTestStore("filter-test-store-2");

      const allCompletions = await completeStoreIds(ctx(), "");
      expect(allCompletions).toContain(store1);
      expect(allCompletions).toContain(store2);

      const firstChars = store1.slice(0, 3);
      const filteredCompletions = await completeStoreIds(ctx(), firstChars);
      expect(filteredCompletions).toContain(store1);

      const nonMatchingCompletions = await completeStoreIds(ctx(), "ZZZZZZ");
      expect(nonMatchingCompletions).toEqual([]);

      await deleteTestStore(store1);
      await deleteTestStore(store2);
    });
  });

  describe("ModelIdCompletionProvider", () => {
    it("includes latest option when no store context", async () => {
      const completions = await completeModelIds(ctx(), "", "");
      expect(completions).toContain("latest");
    });

    it("can fetch real model IDs from store", async () => {
      const { store, model } = await setupTestStoreWithModel();
      setEnv("OPENFGA_MCP_API_STORE", store);

      const completions = await completeModelIds(ctx(), store, "");
      expect(completions).toContain("latest");
      expect(completions).toContain(model);
    });

    it("respects restricted mode", async () => {
      setEnv("OPENFGA_MCP_API_RESTRICT", "true");
      const allowedStore = await createTestStore("allowed-store");
      await createTestStore("restricted-store");
      setEnv("OPENFGA_MCP_API_STORE", allowedStore);

      const allowedCompletions = await completeModelIds(ctx(), allowedStore, "");
      expect(allowedCompletions).toEqual([]);

      const { store } = await setupTestStoreWithModel();
      const otherStoreCompletions = await completeModelIds(ctx(), store, "");
      expect(otherStoreCompletions).toEqual([]);

      await deleteTestStore(allowedStore);
    });
  });

  describe("RelationCompletionProvider", () => {
    it("can fetch real relations from authorization model", async () => {
      const dsl = `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
    define editor: [user]
    define owner: [user]

type folder
  relations
    define viewer: [user]
    define editor: [user]`;

      const { store } = await setupTestStoreWithModel(dsl);
      setEnv("OPENFGA_MCP_API_STORE", store);

      const completions = await completeRelations(ctx(), store, "");
      expect(completions).toContain("viewer");
      expect(completions).toContain("editor");
      expect(completions).toContain("owner");
    });

    it("filters completions correctly", async () => {
      const { store } = await setupTestStoreWithModel();
      setEnv("OPENFGA_MCP_API_STORE", store);

      const readCompletions = await completeRelations(ctx(), store, "read");
      expect(readCompletions).toContain("reader");

      const writeCompletions = await completeRelations(ctx(), store, "writ");
      expect(writeCompletions).toContain("writer");
    });

    it("falls back to common relations when no store context", async () => {
      const completions = await completeRelations(ctx(), "", "view");
      expect(completions).toContain("viewer");
    });
  });

  describe("UserCompletionProvider", () => {
    it("can fetch users from relationship tuples", async () => {
      const { store, model } = await setupTestStoreWithModel();
      await writeTestTuples(store, model, [
        { user: "user:alice", relation: "reader", object: "document:test1" },
        { user: "user:bob", relation: "writer", object: "document:test2" },
      ]);

      setEnv("OPENFGA_MCP_API_STORE", store);

      const completions = await completeFromTuples(ctx(), store, "user", "user:", COMMON_USER_PATTERNS);
      expect(completions).toContain("user:alice");
      expect(completions).toContain("user:bob");
    });

    it("falls back to common user patterns when no data", async () => {
      const completions = await completeFromTuples(ctx(), "", "user", "user:", COMMON_USER_PATTERNS);
      expect(completions).toContain("user:alice");
      expect(completions).toContain("user:bob");
    });
  });

  describe("ObjectCompletionProvider", () => {
    it("can fetch objects from relationship tuples", async () => {
      const { store, model } = await setupTestStoreWithModel();
      await writeTestTuples(store, model, [
        { user: "user:alice", relation: "reader", object: "document:test1" },
        { user: "user:bob", relation: "writer", object: "document:test2" },
      ]);

      setEnv("OPENFGA_MCP_API_STORE", store);

      const completions = await completeFromTuples(ctx(), store, "object", "document:", COMMON_OBJECT_PATTERNS);
      expect(completions).toContain("document:test1");
      expect(completions).toContain("document:test2");
    });

    it("filters completions by current value", async () => {
      const dsl = `model
  schema 1.1

type user

type document
  relations
    define reader: [user]
    define writer: [user]
    define owner: [user]

type folder
  relations
    define reader: [user]`;

      const { store, model } = await setupTestStoreWithModel(dsl);
      await writeTestTuples(store, model, [
        { user: "user:alice", relation: "reader", object: "folder:important" },
        { user: "user:bob", relation: "reader", object: "document:important" },
      ]);

      setEnv("OPENFGA_MCP_API_STORE", store);

      const folderCompletions = await completeFromTuples(ctx(), store, "object", "folder:", COMMON_OBJECT_PATTERNS);
      expect(folderCompletions).toContain("folder:important");
      expect(folderCompletions).not.toContain("document:important");

      const documentCompletions = await completeFromTuples(ctx(), store, "object", "document:", COMMON_OBJECT_PATTERNS);
      expect(documentCompletions).toContain("document:important");
      expect(documentCompletions).not.toContain("folder:important");
    });

    it("falls back to common object patterns when no data", async () => {
      const completions = await completeFromTuples(ctx(), "", "object", "document:", COMMON_OBJECT_PATTERNS);
      expect(completions).toContain("document:");
    });
  });

  describe("Error handling and resilience", () => {
    it("handles network errors gracefully", async () => {
      const invalidClient = new OpenFgaClient({ apiUrl: "http://invalid-url:9999" });
      const completions = await completeStoreIds(createMockContext(invalidClient), "");
      expect(completions).toEqual([]);
    });

    it("handles invalid store IDs gracefully", async () => {
      setEnv("OPENFGA_MCP_API_STORE", "invalid-store-id");

      const completions = await completeModelIds(ctx(), "invalid-store-id", "");
      expect(completions).toContain("latest");
    });
  });
});
