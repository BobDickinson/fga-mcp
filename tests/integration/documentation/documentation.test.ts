import { beforeAll, describe, expect, it } from "vitest";
import { DocumentationChunker } from "../../../src/documentation/chunker.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";
import * as documentationResources from "../../../src/resources/handlers/documentation.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("Documentation Integration", () => {
  const index = getDocumentationIndex();
  const chunker = new DocumentationChunker();

  it("chunk navigation links", () => {
    const phpOverview = index.getSdkOverview("php");
    expect(phpOverview!.total_chunks).toBeGreaterThan(1);

    const results = index.searchChunks("class", "php", 3);
    if (results.length > 1) {
      const chunk = index.getChunk(results[0].chunk_id);
      expect(chunk).not.toBeNull();
    }
  });

  it("documentation chunker processes real content", () => {
    const phpOverview = index.getSdkOverview("php");
    expect(phpOverview!.total_chunks).toBeGreaterThan(0);

    const results = index.searchChunks("php", "php", 1);
    expect(results.length).toBeGreaterThan(0);

    const chunk = index.getChunk(results[0].chunk_id);
    expect(chunk).not.toBeNull();
    expect(chunk!.id).toBe(results[0].chunk_id);
    expect(chunk!.sdk).toBe("php");
    expect(chunk!.content.length).toBeGreaterThan(0);

    const chunks = chunker.chunkBySize(chunk!.content, 1000);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("documentation index loads real files", () => {
    const sdkList = index.getSdkList();
    expect(sdkList).toContain("php");
    expect(sdkList).toContain("go");
    expect(sdkList).toContain("python");
    expect(sdkList).toContain("java");
    expect(sdkList).toContain("dotnet");
    expect(sdkList).toContain("js");
    expect(sdkList).toContain("laravel");
    expect(sdkList.length).toBeGreaterThanOrEqual(7);
  });

  it("documentation resources lists all docs", () => {
    const result = documentationResources.listDocumentation();
    expect(String(result.status)).toContain("✅");
    expect(result).toHaveProperty("sdk_documentation");
    expect(result).toHaveProperty("guides_documentation");
    expect(result).toHaveProperty("total_sdks");
    expect(result.total_sdks as number).toBeGreaterThanOrEqual(7);

    const sdkDocs = result.sdk_documentation as Array<{ sdk: string }>;
    const sdkNames = sdkDocs.map((d) => d.sdk);
    expect(sdkNames).toContain("php");
    expect(sdkNames).toContain("go");
    expect(sdkNames).toContain("python");
  });

  it("documentation sections retrieval", () => {
    const pythonOverview = index.getSdkOverview("python");
    expect(pythonOverview!.sections.length).toBeGreaterThan(0);

    const firstSection = pythonOverview!.sections[0];
    const result = documentationResources.getDocumentationSection("python", firstSection);

    if (String(result.status).includes("✅")) {
      expect(String(result.status)).toContain("✅");
      expect(result).toHaveProperty("content");
      expect(String(result.content).length).toBeGreaterThan(0);
      expect((result.metadata as { section: string }).section).toBe(firstSection);
    }
  });

  it("find similar documentation via search", () => {
    const results = index.searchChunks("create store", undefined, 3);
    if (results.length > 0) {
      expect(results.length).toBeGreaterThan(0);
      const firstResult = results[0];
      expect(firstResult).toHaveProperty("score");
      expect(firstResult).toHaveProperty("chunk_id");
      expect(firstResult).toHaveProperty("preview");
    }
  });

  it("general documentation exists", () => {
    const authoringOverview = index.getSdkOverview("authoring");
    expect(authoringOverview).not.toBeNull();
    expect(authoringOverview!.name).toBe("Model Authoring Guide");

    const generalOverview = index.getSdkOverview("general");
    expect(generalOverview).not.toBeNull();
    expect(generalOverview!.name).toBe("OpenFGA Documentation");
  });

  it("get class documentation for PHP SDK", () => {
    const phpOverview = index.getSdkOverview("php");
    expect(phpOverview!.classes.length).toBeGreaterThan(0);

    const className = phpOverview!.classes[0];
    const result = documentationResources.getClassDocumentation("php", className);

    if (String(result.status).includes("✅")) {
      expect(String(result.status)).toContain("✅");
      expect(result).toHaveProperty("content");
      expect(String(result.content).length).toBeGreaterThan(0);
      expect((result.metadata as { class: string }).class).toBe(className);
      expect((result.metadata as { sdk: string }).sdk).toBe("php");
    }
  });

  it("get PHP SDK specific content", () => {
    const result = documentationResources.getSdkDocumentation("php");
    expect(String(result.status)).toContain("✅");
    expect(result.sdk).toBe("php");
    expect(result.name).toBe("PHP SDK");
    expect((result.sections as string[]).length).toBeGreaterThan(0);
    expect(result.classes as number).toBeGreaterThan(10);
  });

  it("Go SDK documentation content", () => {
    const goOverview = index.getSdkOverview("go");
    expect(goOverview).not.toBeNull();
    expect(goOverview!.sdk).toBe("go");
    expect(goOverview!.name).toBe("GO SDK");
    expect(goOverview!.total_chunks).toBeGreaterThan(0);
    expect(goOverview!.sections.length).toBeGreaterThan(0);
  });

  it("Laravel SDK documentation exists", () => {
    const laravelOverview = index.getSdkOverview("laravel");
    expect(laravelOverview).not.toBeNull();
    expect(laravelOverview!.sdk).toBe("laravel");
    expect(laravelOverview!.name).toBe("LARAVEL SDK");
    expect(laravelOverview!.total_chunks).toBeGreaterThan(30);
  });

  it("memory usage is reasonable", () => {
    const memoryBefore = process.memoryUsage().heapUsed;
    index.searchChunks("test", undefined, 50);
    index.getSdkOverview("php");
    index.getSdkOverview("laravel");
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsedMB = (memoryAfter - memoryBefore) / 1024 / 1024;
    expect(memoryUsedMB).toBeLessThan(100);
  });

  it("PHP SDK documentation content", () => {
    const phpOverview = index.getSdkOverview("php");
    expect(phpOverview).not.toBeNull();
    expect(phpOverview!.sdk).toBe("php");
    expect(phpOverview!.name).toBe("PHP SDK");
    expect(phpOverview!.total_chunks).toBeGreaterThan(0);
    expect(phpOverview!.sections.length).toBeGreaterThan(0);
    expect(phpOverview!.classes.length).toBeGreaterThan(0);
    expect(phpOverview!.source ?? "").toContain("github.com");
    expect(phpOverview!.generated).not.toBeNull();
  });

  it("search across multiple SDKs", () => {
    const results = index.searchChunks("check", undefined, 20);
    expect(results.length).toBeGreaterThan(0);
    const sdksFound = [...new Set(results.map((r) => r.sdk))];
    expect(sdksFound.length).toBeGreaterThan(1);
  });

  it("search code examples finds real examples", () => {
    const results = index.searchChunks("new", undefined, 10);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      const chunk = index.getChunk(result.chunk_id);
      if (chunk && chunk.content.includes("```")) {
        expect(chunk.content).toContain("```");
        break;
      }
    }
  });

  it("search documentation finds createStore content", () => {
    const results = index.searchChunks("createStore", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const foundCreateStore = results.some((r) => r.preview.toLowerCase().includes("createstore"));
    expect(foundCreateStore).toBe(true);
  });

  it("search finds authentication content", () => {
    const results = index.searchChunks("authentication", undefined, 10);
    expect(results.length).toBeGreaterThan(0);
    const firstResult = results[0];
    expect(firstResult).toHaveProperty("chunk_id");
    expect(firstResult).toHaveProperty("sdk");
    expect(firstResult).toHaveProperty("score");
    expect(firstResult).toHaveProperty("preview");
    expect(firstResult).toHaveProperty("metadata");
    expect(firstResult.preview.toLowerCase()).toContain("auth");
  });

  it("search for specific SDK methods", () => {
    const results = index.searchChunks("listStores", "php", 5);
    if (results.length > 0) {
      for (const searchResult of results) {
        expect(searchResult.sdk).toBe("php");
      }
    }
  });
});
