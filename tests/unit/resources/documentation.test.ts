import { beforeAll, describe, expect, it } from "vitest";
import * as documentationResources from "../../../src/resources/handlers/documentation.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("listDocumentation resource", () => {
  it("returns documentation list structure", () => {
    const result = documentationResources.listDocumentation();
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("sdk_documentation");
      expect(result).toHaveProperty("guides_documentation");
      expect(result).toHaveProperty("total_sdks");
      expect(result).toHaveProperty("endpoints");
      expect(Array.isArray(result.sdk_documentation)).toBe(true);
      expect(Array.isArray(result.guides_documentation)).toBe(true);
      expect(typeof result.total_sdks).toBe("number");
      expect(result.endpoints).toBeTypeOf("object");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});

describe("getSdkDocumentation resource template", () => {
  it("handles SDK documentation requests", () => {
    const result = documentationResources.getSdkDocumentation("php");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    expect(result.sdk).toBe("php");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("sections");
      expect(result).toHaveProperty("total_chunks");
      expect(result).toHaveProperty("type");
    } else {
      expect(result).toHaveProperty("available_sdks");
    }
  });

  it("handles non-existent SDK", () => {
    const result = documentationResources.getSdkDocumentation("definitely_nonexistent_sdk_123");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(String(result.status)).toContain("❌");
    expect(result.requested_sdk).toBe("definitely_nonexistent_sdk_123");
    expect(result).toHaveProperty("available_sdks");
    expect(Array.isArray(result.available_sdks)).toBe(true);
  });

  it("handles general documentation type", () => {
    const result = documentationResources.getSdkDocumentation("general");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(result.sdk).toBe("general");
    if (String(result.status).includes("✅")) {
      expect(result.type).toBe("general");
    }
  });

  it("handles authoring documentation type", () => {
    const result = documentationResources.getSdkDocumentation("authoring");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(result.sdk).toBe("authoring");
    if (String(result.status).includes("✅")) {
      expect(result.type).toBe("general");
    }
  });
});

describe("getClassDocumentation resource template", () => {
  it("handles class documentation requests", () => {
    const result = documentationResources.getClassDocumentation("php", "SomeClass");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    expect(result.sdk).toBe("php");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("class");
      expect(result.metadata).toHaveProperty("sdk");
      expect(result.metadata).toHaveProperty("namespace");
      expect(result.metadata).toHaveProperty("methods");
      expect(result.metadata).toHaveProperty("method_count");
    } else if (String(result.status).includes("❌") && String(result.status).toLowerCase().includes("not found")) {
      expect(result).toHaveProperty("requested_class");
      expect(result).toHaveProperty("available_classes");
    } else {
      expect(result).toHaveProperty("class");
      expect(result).toHaveProperty("error");
    }
  });

  it("handles non-existent class", () => {
    const result = documentationResources.getClassDocumentation("nonexistent_sdk", "NonExistentClass");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    if (String(result.status).toLowerCase().includes("not found")) {
      expect(result.requested_class).toBe("NonExistentClass");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});

describe("getMethodDocumentation resource template", () => {
  it("handles method documentation requests", () => {
    const result = documentationResources.getMethodDocumentation("php", "SomeClass", "someMethod");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    expect(result.sdk).toBe("php");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("method");
      expect(result.metadata).toHaveProperty("class");
      expect(result.metadata).toHaveProperty("sdk");
      expect(result.metadata).toHaveProperty("signature");
      expect(result.metadata).toHaveProperty("parameters");
      expect(result.metadata).toHaveProperty("returns");
    } else if (String(result.status).includes("❌") && String(result.status).toLowerCase().includes("not found")) {
      expect(result).toHaveProperty("requested_method");
      expect(result).toHaveProperty("class");
      expect(result).toHaveProperty("available_methods");
    } else {
      expect(result).toHaveProperty("method");
      expect(result).toHaveProperty("class");
      expect(result).toHaveProperty("error");
    }
  });

  it("handles non-existent method", () => {
    const result = documentationResources.getMethodDocumentation("nonexistent_sdk", "SomeClass", "nonExistentMethod");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    if (String(result.status).toLowerCase().includes("not found")) {
      expect(result.requested_method).toBe("nonExistentMethod");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});

describe("getDocumentationSection resource template", () => {
  it("handles section requests", () => {
    const result = documentationResources.getDocumentationSection("php", "SomeSection");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    expect(result.sdk).toBe("php");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("section");
      expect(result.metadata).toHaveProperty("sdk");
      expect(result.metadata).toHaveProperty("chunk_count");
      expect(result.metadata).toHaveProperty("total_size");
    } else if (String(result.status).includes("❌") && String(result.status).toLowerCase().includes("not found")) {
      expect(result).toHaveProperty("requested_section");
      expect(result).toHaveProperty("available_sections");
    } else {
      expect(result).toHaveProperty("section");
      expect(result).toHaveProperty("error");
    }
  });

  it("handles non-existent section", () => {
    const result = documentationResources.getDocumentationSection("nonexistent_sdk", "NonExistentSection");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    if (String(result.status).toLowerCase().includes("not found")) {
      expect(result.requested_section).toBe("NonExistentSection");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});

describe("getDocumentationChunk resource template", () => {
  it("handles chunk requests", () => {
    const result = documentationResources.getDocumentationChunk("php", "some_chunk_id");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    expect(result.sdk).toBe("php");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("navigation");
      expect(result.metadata).toHaveProperty("chunk_id");
      expect(result.metadata).toHaveProperty("sdk");
    } else if (String(result.status).includes("❌") && String(result.status).toLowerCase().includes("not found")) {
      expect(result).toHaveProperty("requested_chunk");
      expect(result).toHaveProperty("note");
    } else {
      expect(result).toHaveProperty("chunk_id");
      expect(result).toHaveProperty("error");
    }
  });

  it("handles non-existent chunk", () => {
    const result = documentationResources.getDocumentationChunk("nonexistent_sdk", "NonExistentChunk");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    if (String(result.status).toLowerCase().includes("not found")) {
      expect(result.requested_chunk).toBe("NonExistentChunk");
    } else {
      expect(result).toHaveProperty("error");
    }
  });
});

describe("searchDocumentation resource template", () => {
  it("handles search requests", () => {
    const result = documentationResources.searchDocumentation("test_query");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    expect(result.query).toBe("test_query");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("total_results");
      expect(result).toHaveProperty("results");
      expect(Array.isArray(result.results)).toBe(true);
    } else if (String(result.status).includes("No Results")) {
      expect(result).toHaveProperty("available_sdks");
    } else {
      expect(result).toHaveProperty("error");
    }
  });

  it("handles empty search query", () => {
    const result = documentationResources.searchDocumentation("");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(result.query).toBe("");
  });

  it("handles special characters in search", () => {
    const result = documentationResources.searchDocumentation("check() && expand()");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(result.query).toBe("check() && expand()");
  });
});

describe("offline mode behavior", () => {
  it("works in offline mode", () => {
    const result = documentationResources.listDocumentation();
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(typeof result.status).toBe("string");
    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("sdk_documentation");
    } else {
      expect(result).toHaveProperty("error");
    }
  });

  it("search works in offline mode", () => {
    const result = documentationResources.searchDocumentation("test");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("query");
  });
});

describe("response structure validation", () => {
  it("all methods return arrays with status key", () => {
    const methods: Array<[() => Record<string, unknown>, string]> = [
      [() => documentationResources.listDocumentation(), "listDocumentation"],
      [() => documentationResources.getSdkDocumentation("php"), "getSdkDocumentation"],
      [() => documentationResources.getClassDocumentation("php", "Test"), "getClassDocumentation"],
      [() => documentationResources.getMethodDocumentation("php", "Test", "method"), "getMethodDocumentation"],
      [() => documentationResources.getDocumentationSection("php", "section"), "getDocumentationSection"],
      [() => documentationResources.getDocumentationChunk("php", "chunk-1"), "getDocumentationChunk"],
      [() => documentationResources.searchDocumentation("query"), "searchDocumentation"],
    ];

    for (const [fn, name] of methods) {
      const result = fn();
      expect(result, `${name} should return object`).toBeTypeOf("object");
      expect(result, `${name} should have status`).toHaveProperty("status");
      expect(typeof result.status, `${name} status should be string`).toBe("string");
    }
  });
});

describe("navigation handling", () => {
  it("handles navigation in chunk results", () => {
    const index = getDocumentationIndex();
    const results = index.searchChunks("class", "php", 3);
    const chunkId = results[0]?.chunk_id ?? "chunk-123";
    const result = documentationResources.getDocumentationChunk("php", chunkId);

    expect(result).toBeTypeOf("object");
    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("navigation");
      expect(result.navigation).toBeTypeOf("object");
      const nav = result.navigation as Record<string, string>;
      for (const [key, value] of Object.entries(nav)) {
        expect(["previous", "next"]).toContain(key);
        expect(typeof value).toBe("string");
      }
    }
  });
});

describe("metadata validation", () => {
  it("class documentation has proper metadata structure", () => {
    const result = documentationResources.getClassDocumentation("php", "TestClass");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("class");
      expect(result.metadata).toHaveProperty("sdk");
      expect(result.metadata).toHaveProperty("methods");
      expect(Array.isArray(result.metadata!.methods)).toBe(true);
      expect(result.metadata).toHaveProperty("method_count");
      expect(typeof result.metadata!.method_count).toBe("number");
    } else {
      expect(String(result.status)).toContain("❌");
      if (result.requested_class) {
        expect(result).toHaveProperty("requested_class");
        expect(result).toHaveProperty("available_classes");
      } else if (result.requested_method) {
        expect(result).toHaveProperty("requested_method");
        expect(result).toHaveProperty("available_methods");
      }
      expect(result).toHaveProperty("sdk");
    }
  });

  it("method documentation has proper metadata structure", () => {
    const result = documentationResources.getMethodDocumentation("php", "TestClass", "testMethod");
    expect(result).toBeTypeOf("object");
    expect(result).toHaveProperty("status");

    if (String(result.status).includes("✅")) {
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("method");
      expect(result.metadata).toHaveProperty("class");
      expect(result.metadata).toHaveProperty("sdk");
      expect(result.metadata).toHaveProperty("parameters");
      expect(Array.isArray(result.metadata!.parameters)).toBe(true);
    } else {
      expect(String(result.status)).toContain("❌");
      if (result.requested_class) {
        expect(result).toHaveProperty("requested_class");
        expect(result).toHaveProperty("available_classes");
      } else if (result.requested_method) {
        expect(result).toHaveProperty("requested_method");
        expect(result).toHaveProperty("available_methods");
      }
      expect(result).toHaveProperty("sdk");
    }
  });
});
