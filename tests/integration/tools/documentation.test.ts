import { beforeAll, describe, expect, it } from "vitest";
import { findSimilarDocumentation, searchCodeExamples, searchDocumentation } from "../../../src/documentation/search.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("DocumentationTools Integration", () => {
  it("code example formatting is valid", () => {
    const result = searchCodeExamples("client", undefined, true, 2);
    if (!result.includes("No code examples found")) {
      expect(result).toMatch(/### Example \d+/);
      expect(result).toMatch(/```\w*\n/);
      const codeBlockStarts = (result.match(/```/g) ?? []).length;
      expect(codeBlockStarts % 2).toBe(0);
    }
  });

  it("different search types return different results", () => {
    const query = "Client";
    const contentResults = searchDocumentation(query, undefined, "content", 5);
    const classResults = searchDocumentation(query, undefined, "class", 5);
    const methodResults = searchDocumentation(query, undefined, "method", 5);
    const sectionResults = searchDocumentation(query, undefined, "section", 5);

    expect(typeof contentResults).toBe("string");
    expect(typeof classResults).toBe("string");
    expect(typeof methodResults).toBe("string");
    expect(typeof sectionResults).toBe("string");
    expect(contentResults).toContain("**Search Type:** content");
    expect(classResults).toContain("**Search Type:** class");
    expect(methodResults).toContain("**Search Type:** method");
    expect(sectionResults).toContain("**Search Type:** section");
  });

  it("findSimilarDocumentation with real content", () => {
    const content =
      "I need to understand how to perform authorization checks in OpenFGA. " +
      "Specifically, I want to check if a user has permission to access a resource.";
    const result = findSimilarDocumentation(content, undefined, 0.3, 5);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Similar Documentation");
    expect(result).toContain("**Similarity Threshold:** 0.3");
    if (!result.includes("No similar documentation found")) {
      expect(result).toContain("**Similarity Score:**");
      expect(result).toMatch(/### \d+\./);
    }
  });

  it("handles special characters in queries", () => {
    const queries = ["check()", "user:anne", "document#viewer", "can_view->document", "$request->check()"];
    for (const query of queries) {
      const result = searchDocumentation(query);
      expect(typeof result).toBe("string");
      expect(result).not.toContain("❌");
      expect(result).toContain("## Documentation Search Results");
    }
  });

  it("language mapping works", () => {
    const languages: Record<string, string> = {
      php: "PHP",
      go: "Go",
      python: "Python",
      java: "Java",
      csharp: "C#",
      javascript: "JavaScript",
      typescript: "TypeScript",
    };
    for (const langCode of Object.keys(languages)) {
      const result = searchCodeExamples("client", langCode as "php", false, 1);
      expect(typeof result).toBe("string");
      expect(result).toContain(`**Language:** ${langCode}`);
    }
  });

  it("markdown formatting is valid", () => {
    const result = searchDocumentation("OpenFGA", undefined, "content", 3);
    expect(result).toMatch(/^## /m);
    expect(result).toContain("**Query:**");
    if (!result.includes("No results found")) {
      expect(result).toMatch(/### \d+\./);
      if (result.includes("**SDK:**")) {
        expect(result).toMatch(/\*\*SDK:\*\* `[^`]+`/);
      }
    }
  });

  it("memory usage is reasonable", () => {
    const memoryBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10; i++) {
      searchDocumentation(`test${i}`, undefined, "content", 20);
    }
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsedMB = (memoryAfter - memoryBefore) / 1024 / 1024;
    expect(memoryUsedMB).toBeLessThan(50);
  });

  it("multiple SDK searches", () => {
    const sdks = ["php", "go", "python", "java", "dotnet", "js"] as const;
    for (const sdk of sdks) {
      const result = searchDocumentation("client", sdk, "content", 2);
      expect(typeof result).toBe("string");
      expect(result).toContain(`**SDK Filter:** ${sdk}`);
      if (!result.includes("No results found")) {
        expect(result.toLowerCase()).toContain(sdk);
      }
    }
  });

  it("pagination works", () => {
    const page1 = searchDocumentation("the", undefined, "content", 5, 0);
    const page2 = searchDocumentation("the", undefined, "content", 5, 5);
    expect(typeof page1).toBe("string");
    expect(typeof page2).toBe("string");
    if (!page1.includes("No results found") && !page2.includes("No results found")) {
      const match1 = page1.match(/Results: Showing (\d+)-(\d+)/);
      const match2 = page2.match(/Results: Showing (\d+)-(\d+)/);
      if (match1 && match2) {
        expect(match1[1]).not.toBe(match2[1]);
      }
    }
  });

  it("searchCodeExamples finds real examples", () => {
    const result = searchCodeExamples("new Client", "php", true, 3);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Code Examples");
    expect(result).toContain("**Search:** `new Client`");
    expect(result).toContain("**Language:** php");
    if (!result.includes("No code examples found")) {
      expect(result).toMatch(/```\w*\n/);
      expect(result).toContain("### Example");
    }
  });

  it("searchCodeExamples with context", () => {
    const result = searchCodeExamples("check", undefined, true, 2);
    expect(typeof result).toBe("string");
    if (!result.includes("No code examples found") && result.includes("**Context:**")) {
      expect(result).toContain("**Context:**");
      expect(result).toContain("*(see code below)*");
    }
  });

  it("searchDocumentation finds real content", () => {
    const result = searchDocumentation("check", undefined, "content", 5);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Documentation Search Results");
    expect(result).toContain("**Query:** `check`");
    if (!result.includes("No results found")) {
      expect(result).toContain("Results:");
      expect(result).toMatch(/### \d+\./);
    }
  });

  it("searchDocumentation with SDK filter", () => {
    const result = searchDocumentation("Client", "php", "class", 10);
    expect(typeof result).toBe("string");
    expect(result).toContain("**SDK Filter:** php");
    expect(result).toContain("**Search Type:** class");
    if (!result.includes("No results found")) {
      expect(result.toLowerCase()).toContain("php");
    }
  });

  it("search performance is reasonable", () => {
    const startTime = performance.now();
    searchDocumentation("authorization", undefined, "content", 10);
    searchCodeExamples("client", "php", true, 5);
    findSimilarDocumentation("OpenFGA tuples and relationships", undefined, 0.5, 5);
    const duration = (performance.now() - startTime) / 1000;
    expect(duration).toBeLessThan(5.0);
  });

  it("similarity threshold affects results", () => {
    const content = "OpenFGA authorization and permission checking";
    const lowThreshold = findSimilarDocumentation(content, undefined, 0.1, 10);
    const highThreshold = findSimilarDocumentation(content, undefined, 0.8, 10);
    const lowCount = (lowThreshold.match(/### \d+\./g) ?? []).length;
    const highCount = (highThreshold.match(/### \d+\./g) ?? []).length;
    expect(lowCount).toBeGreaterThanOrEqual(highCount);
  });
});
