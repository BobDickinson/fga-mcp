import { beforeAll, describe, expect, it } from "vitest";
import {
  getClassDocumentation,
  getDocumentationChunk,
  getDocumentationSection,
  getMethodDocumentation,
  getSdkDocumentation,
  listDocumentation,
  searchDocumentation,
} from "../../../src/resources/handlers/documentation.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

function firstExistingClass(sdk: string): string | null {
  const index = getDocumentationIndex();
  const overview = index.getSdkOverview(sdk);
  if (!overview) return null;
  return overview.classes.find((name) => index.getClassDocumentation(sdk, name) !== null) ?? null;
}

function firstExistingMethod(sdk: string, className: string): string | null {
  const index = getDocumentationIndex();
  const classDoc = index.getClassDocumentation(sdk, className);
  if (!classDoc) return null;
  const methods = Object.keys(classDoc.methods);
  return methods.find((name) => index.getMethodDocumentation(sdk, className, name) !== null) ?? null;
}

describe("listDocumentation response shape", () => {
  it("returns success shape with status and index keys", () => {
    const result = listDocumentation();

    expect(result).toHaveProperty("status");
    expect(result.status).toBe("✅ Documentation Index");
    expect(result).toHaveProperty("sdk_documentation");
    expect(result).toHaveProperty("guides_documentation");
    expect(result).toHaveProperty("total_sdks");
    expect(result).toHaveProperty("endpoints");
    expect(Array.isArray(result.sdk_documentation)).toBe(true);
    expect(Array.isArray(result.guides_documentation)).toBe(true);
    expect(typeof result.total_sdks).toBe("number");
    expect(result.endpoints).toBeTypeOf("object");
  });

  it("includes sdk entries with expected fields", () => {
    const result = listDocumentation();
    const sdkDocs = result.sdk_documentation as Array<Record<string, unknown>>;

    expect(sdkDocs.length).toBeGreaterThan(0);
    expect(result.total_sdks).toBe(sdkDocs.length);

    for (const entry of sdkDocs) {
      expect(entry).toHaveProperty("sdk");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("sections");
      expect(entry).toHaveProperty("classes");
      expect(entry).toHaveProperty("chunks");
      expect(entry).toHaveProperty("uri");
      expect(String(entry.uri)).toMatch(/^openfga:\/\/docs\//);
    }
  });

  it("includes documentation endpoint hints", () => {
    const endpoints = listDocumentation().endpoints as Record<string, string>;

    expect(endpoints).toHaveProperty("openfga://docs/{sdk}");
    expect(endpoints).toHaveProperty("openfga://docs/search/{query}");
  });
});

describe("getSdkDocumentation response shape", () => {
  it("returns not found shape for unknown SDK", () => {
    const result = getSdkDocumentation("unknown-sdk-xyz-999");

    expect(result.status).toBe("❌ Not Found");
    expect(result.requested_sdk).toBe("unknown-sdk-xyz-999");
    expect(result).toHaveProperty("available_sdks");
    expect(Array.isArray(result.available_sdks)).toBe(true);
  });

  it("returns success shape for a valid SDK", () => {
    const sdk = getDocumentationIndex().getSdkList()[0];
    expect(sdk).toBeDefined();

    const result = getSdkDocumentation(sdk!);

    expect(result.status).toBe("✅ SDK Documentation");
    expect(result.type).toBe("sdk");
    expect(result.sdk).toBe(sdk);
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("source");
    expect(result).toHaveProperty("generated");
    expect(result).toHaveProperty("sections");
    expect(result).toHaveProperty("total_chunks");
    expect(result).toHaveProperty("classes");
    expect(result).toHaveProperty("endpoints");
    expect(Array.isArray(result.sections)).toBe(true);
    expect(typeof result.total_chunks).toBe("number");
  });

  it("returns general documentation shape for guide types", () => {
    const result = getSdkDocumentation("general");

    expect(result.status).toBe("✅ Documentation");
    expect(result.type).toBe("general");
    expect(result.sdk).toBe("general");
    expect(result.classes).toBeUndefined();
  });
});

describe("getClassDocumentation response shape", () => {
  it("returns not found shape for unknown class", () => {
    const result = getClassDocumentation("php", "NonExistentClassXYZ");

    expect(result.status).toBe("❌ Not Found");
    expect(result.requested_class).toBe("NonExistentClassXYZ");
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("available_classes");
    expect(Array.isArray(result.available_classes)).toBe(true);
  });

  it("returns success shape when class exists", () => {
    const className = firstExistingClass("php");
    if (!className) return;

    const result = getClassDocumentation("php", className);

    expect(result.status).toBe("✅ Class Documentation");
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toMatchObject({
      class: className,
      sdk: "php",
    });
    expect(result.metadata).toHaveProperty("namespace");
    expect(result.metadata).toHaveProperty("methods");
    expect(result.metadata).toHaveProperty("method_count");
    expect(Array.isArray(result.metadata!.methods)).toBe(true);
    expect(typeof result.metadata!.method_count).toBe("number");
  });
});

describe("getMethodDocumentation response shape", () => {
  it("returns not found shape for unknown method", () => {
    const result = getMethodDocumentation("php", "SomeClass", "missingMethodXYZ");

    expect(result.status).toBe("❌ Not Found");
    expect(result.requested_method).toBe("missingMethodXYZ");
    expect(result.class).toBe("SomeClass");
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("available_methods");
    expect(Array.isArray(result.available_methods)).toBe(true);
  });

  it("returns success shape when method exists", () => {
    const className = firstExistingClass("php");
    if (!className) return;
    const methodName = firstExistingMethod("php", className);
    if (!methodName) return;

    const result = getMethodDocumentation("php", className, methodName);

    expect(result.status).toBe("✅ Method Documentation");
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
    expect(result.metadata).toMatchObject({
      method: methodName,
      class: className,
      sdk: "php",
    });
    expect(result.metadata).toHaveProperty("signature");
    expect(result.metadata).toHaveProperty("parameters");
    expect(result.metadata).toHaveProperty("returns");
    expect(Array.isArray(result.metadata!.parameters)).toBe(true);
  });
});

describe("getDocumentationSection response shape", () => {
  it("returns not found shape for unknown section", () => {
    const result = getDocumentationSection("php", "missing-section-xyz");

    expect(result.status).toBe("❌ Not Found");
    expect(result.requested_section).toBe("missing-section-xyz");
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("available_sections");
    expect(Array.isArray(result.available_sections)).toBe(true);
  });

  it("returns success shape when section exists", () => {
    const overview = getDocumentationIndex().getSdkOverview("php");
    if (!overview || overview.sections.length === 0) return;

    const sectionName = overview.sections[0];
    const result = getDocumentationSection("php", sectionName);

    expect(result.status).toBe("✅ Section Documentation");
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
    expect(result.metadata).toMatchObject({
      section: sectionName,
      sdk: "php",
    });
    expect(result.metadata).toHaveProperty("chunk_count");
    expect(result.metadata).toHaveProperty("total_size");
    expect(typeof result.metadata!.chunk_count).toBe("number");
    expect(typeof result.metadata!.total_size).toBe("number");
  });
});

describe("getDocumentationChunk response shape", () => {
  it("returns not found shape for unknown chunk", () => {
    const result = getDocumentationChunk("php", "chunk-404-xyz");

    expect(result.status).toBe("❌ Not Found");
    expect(result.requested_chunk).toBe("chunk-404-xyz");
    expect(result.sdk).toBe("php");
    expect(result.note).toBe("Chunk not found in documentation index");
  });

  it("returns success shape when chunk exists", () => {
    const results = getDocumentationIndex().searchChunks("OpenFGA", "php", 1);
    const chunkId = results[0]?.chunk_id;
    if (!chunkId) return;

    const result = getDocumentationChunk("php", chunkId);

    expect(result.status).toBe(`✅ Documentation Chunk: ${chunkId}`);
    expect(result.sdk).toBe("php");
    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toHaveProperty("chunk_id", chunkId);
    expect(result.metadata).toHaveProperty("sdk", "php");
    expect(result).toHaveProperty("navigation");
    expect(result.navigation).toBeTypeOf("object");
  });
});

describe("searchDocumentation response shape", () => {
  it("returns no results shape when query has no matches", () => {
    const query = "xyznomatchstring12345";
    const result = searchDocumentation(query);

    expect(result.status).toBe("❌ No Results");
    expect(result.query).toBe(query);
    expect(result).toHaveProperty("available_sdks");
    expect(Array.isArray(result.available_sdks)).toBe(true);
  });

  it("returns success shape with result entries", () => {
    const query = "check";
    const result = searchDocumentation(query);

    if (result.status !== "✅ Search Results") return;

    expect(result.query).toBe(query);
    expect(result).toHaveProperty("total_results");
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.total_results).toBe((result.results as unknown[]).length);

    for (const entry of result.results as Array<Record<string, unknown>>) {
      expect(entry).toHaveProperty("chunk_id");
      expect(entry).toHaveProperty("sdk");
      expect(entry).toHaveProperty("score");
      expect(entry).toHaveProperty("preview");
      expect(entry).toHaveProperty("metadata");
      expect(entry).toHaveProperty("uri");
      expect(String(entry.uri)).toMatch(/^openfga:\/\/docs\/.+\/chunk\//);
    }
  });
});

describe("documentation response common behavior", () => {
  it("all handlers return objects with a string status key", () => {
    const handlers: Array<[() => Record<string, unknown>, string]> = [
      [() => listDocumentation(), "listDocumentation"],
      [() => getSdkDocumentation("php"), "getSdkDocumentation"],
      [() => getClassDocumentation("php", "Test"), "getClassDocumentation"],
      [() => getMethodDocumentation("php", "Test", "method"), "getMethodDocumentation"],
      [() => getDocumentationSection("php", "section"), "getDocumentationSection"],
      [() => getDocumentationChunk("php", "chunk-1"), "getDocumentationChunk"],
      [() => searchDocumentation("query"), "searchDocumentation"],
    ];

    for (const [handler, name] of handlers) {
      const result = handler();
      expect(result, `${name} should return object`).toBeTypeOf("object");
      expect(result, `${name} should have status`).toHaveProperty("status");
      expect(typeof result.status, `${name} status should be string`).toBe("string");
    }
  });

  it("error responses use ❌ status prefix", () => {
    const errorResults = [
      getSdkDocumentation("unknown-sdk-xyz-999"),
      getClassDocumentation("php", "NonExistentClassXYZ"),
      getMethodDocumentation("php", "SomeClass", "missingMethodXYZ"),
      getDocumentationSection("php", "missing-section-xyz"),
      getDocumentationChunk("php", "chunk-404-xyz"),
      searchDocumentation("xyznomatchstring12345"),
    ];

    for (const result of errorResults) {
      expect(String(result.status)).toMatch(/^❌/);
    }
  });
});
