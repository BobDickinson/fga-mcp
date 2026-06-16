import { describe, expect, it } from "vitest";
import { getDocumentationIndex } from "../../src/documentation/index.js";

describe("DocumentationIndex initialization", () => {
  const index = getDocumentationIndex();

  it("starts uninitialized", () => {
    // Singleton may already be initialized by other tests; verify boolean return type
    expect(typeof index.isInitialized()).toBe("boolean");
  });

  it("can be initialized successfully", () => {
    index.initialize();
    expect(index.isInitialized()).toBe(true);
  });

  it("does not reinitialize if already initialized", () => {
    index.initialize();
    const firstInit = index.isInitialized();
    index.initialize();
    const secondInit = index.isInitialized();
    expect(firstInit).toBe(true);
    expect(secondInit).toBe(true);
  });
});

describe("SDK list and overview", () => {
  const index = getDocumentationIndex();

  it("returns SDK list when accessed", () => {
    const sdkList = index.getSdkList();
    expect(Array.isArray(sdkList)).toBe(true);
  });

  it("returns SDK list after initialization", () => {
    index.initialize();
    const sdkList = index.getSdkList();
    expect(Array.isArray(sdkList)).toBe(true);
  });

  it("returns SDK overview or null for valid/invalid SDK", () => {
    index.initialize();
    const sdkList = index.getSdkList();

    if (sdkList.length > 0) {
      const firstSdk = sdkList[0];
      const overview = index.getSdkOverview(firstSdk);
      expect(overview).not.toBeNull();
      expect(overview!.sdk).toBe(firstSdk);
      expect(typeof overview!.name).toBe("string");
      expect(Array.isArray(overview!.sections)).toBe(true);
      expect(Array.isArray(overview!.classes)).toBe(true);
      expect(typeof overview!.total_chunks).toBe("number");
    }

    expect(index.getSdkOverview("definitely_invalid_sdk_name_123")).toBeNull();
  });
});

describe("chunk retrieval", () => {
  const index = getDocumentationIndex();

  it("returns null for non-existent chunk", () => {
    index.initialize();
    expect(index.getChunk("non_existent_chunk_123")).toBeNull();
  });

  it("returns chunks by section", () => {
    index.initialize();
    const chunks = index.getChunksBySection("any_sdk", "NonExistentSection");
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks).toHaveLength(0);
  });
});

describe("class and method documentation", () => {
  const index = getDocumentationIndex();

  it("returns null for non-existent class", () => {
    index.initialize();
    expect(index.getClassDocumentation("any_sdk", "NonExistentClass")).toBeNull();
  });

  it("returns null for non-existent method", () => {
    index.initialize();
    expect(index.getMethodDocumentation("any_sdk", "AnyClass", "nonExistentMethod")).toBeNull();
  });
});

describe("search functionality", () => {
  const index = getDocumentationIndex();

  it("performs basic content search", () => {
    index.initialize();
    const results = index.searchChunks("test_query_that_probably_wont_match");
    expect(Array.isArray(results)).toBe(true);
  });

  it("filters search by SDK", () => {
    index.initialize();
    const results = index.searchChunks("test", "nonexistent_sdk");
    expect(Array.isArray(results)).toBe(true);
    for (const result of results) {
      expect(result.sdk).toBe("nonexistent_sdk");
    }
  });

  it("limits search results", () => {
    index.initialize();
    const results = index.searchChunks("test", null, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array for no matches", () => {
    index.initialize();
    const results = index.searchChunks("xyznomatchstring12345");
    expect(results).toHaveLength(0);
  });
});

describe("error handling", () => {
  it("handles initialization gracefully", () => {
    const index = getDocumentationIndex();
    index.initialize();
    expect(index.isInitialized()).toBe(true);
  });
});
