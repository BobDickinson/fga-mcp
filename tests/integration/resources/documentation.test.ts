import { beforeAll, describe, expect, it } from "vitest";
import * as documentationResources from "../../../src/resources/handlers/documentation.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("DocumentationResources Integration", () => {
  it("returns full documentation index", () => {
    const result = documentationResources.listDocumentation();
    expect(result.total_sdks).toBeGreaterThan(0);
    expect((result.sdk_documentation as unknown[]).length).toBeGreaterThan(0);
    expect((result.guides_documentation as unknown[]).length).toBeGreaterThan(0);
  });

  it("returns SDK documentation with sections and classes", () => {
    const result = documentationResources.getSdkDocumentation("php");
    expect(String(result.status)).toContain("✅");
    expect((result.sections as unknown[]).length).toBeGreaterThan(0);
    expect(result.total_chunks).toBeGreaterThan(0);
  });

  it("searches documentation and returns results with URIs", () => {
    const result = documentationResources.searchDocumentation("check");
    if (result.status === "✅ Search Results") {
      expect((result.results as Array<{ uri: string; chunk_id: string }>).length).toBeGreaterThan(0);
      expect((result.results as Array<{ uri: string }>)[0].uri).toMatch(/^openfga:\/\/docs\//);
    }
  });

  it("retrieves class documentation when class exists", () => {
    const index = getDocumentationIndex();
    const overview = index.getSdkOverview("php");
    if (!overview || overview.classes.length === 0) return;

    const className = overview.classes.find((name) => index.getClassDocumentation("php", name) !== null);
    if (!className) return;

    const result = documentationResources.getClassDocumentation("php", className);
    expect(String(result.status)).toContain("✅");
    expect(typeof result.content).toBe("string");
    expect((result.content as string).length).toBeGreaterThan(0);
  });

  it("retrieves section documentation when section exists", () => {
    const index = getDocumentationIndex();
    const overview = index.getSdkOverview("php");
    if (!overview || overview.sections.length === 0) return;

    const result = documentationResources.getDocumentationSection("php", overview.sections[0]);
    expect(String(result.status)).toContain("✅");
    expect(typeof result.content).toBe("string");
  });
});
