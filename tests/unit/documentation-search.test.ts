import { beforeAll, describe, expect, it } from "vitest";
import {
  findSimilarDocumentation,
  searchCodeExamples,
  searchDocumentation,
} from "../../src/documentation/search.js";
import { getDocumentationIndex } from "../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("searchDocumentation", () => {
  it("returns error for empty query", () => {
    expect(searchDocumentation("")).toContain("❌ Search query cannot be empty");
  });

  it("returns error for invalid limit", () => {
    expect(searchDocumentation("test", undefined, "content", 0)).toContain("❌ Limit must be between 1 and 50");
    expect(searchDocumentation("test", undefined, "content", 51)).toContain("❌ Limit must be between 1 and 50");
  });

  it("returns error for negative offset", () => {
    expect(searchDocumentation("test", undefined, "content", 10, -1)).toContain("❌ Offset cannot be negative");
  });

  it("returns error for invalid search type", () => {
    const result = searchDocumentation("test", undefined, "invalid_type" as "content");
    expect(result).toContain("❌ Invalid search_type");
    expect(result).toContain("content, class, method, section");
  });

  it("returns error for invalid SDK", () => {
    const result = searchDocumentation("test", "invalid_sdk" as "php");
    expect(result).toContain("❌ Invalid SDK");
    expect(result).toContain("php, go, python, java, dotnet, js, laravel");
  });

  it("performs basic content search", () => {
    const result = searchDocumentation("openfga");
    expect(typeof result).toBe("string");
    expect(result).toContain("## Documentation Search Results");
    expect(result).toContain("**Query:** `openfga`");
  });

  it("performs search with SDK filter", () => {
    const result = searchDocumentation("check", "php");
    expect(typeof result).toBe("string");
    expect(result).toContain("## Documentation Search Results");
    expect(result).toContain("**SDK Filter:** php");
  });

  it("performs class search", () => {
    const result = searchDocumentation("Client", undefined, "class");
    expect(typeof result).toBe("string");
    expect(result).toContain("**Search Type:** class");
  });

  it("performs method search", () => {
    const result = searchDocumentation("check", undefined, "method");
    expect(typeof result).toBe("string");
    expect(result).toContain("**Search Type:** method");
  });

  it("performs section search", () => {
    const result = searchDocumentation("Authentication", undefined, "section");
    expect(typeof result).toBe("string");
    expect(result).toContain("**Search Type:** section");
  });

  it("handles pagination properly", () => {
    const result = searchDocumentation("test", undefined, "content", 5, 10);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Documentation Search Results");
    if (result.includes("Results:")) {
      expect(result).toMatch(/\*\*Results:\*\* Showing \d+/);
    }
  });

  it("formats no results message properly", () => {
    const result = searchDocumentation("xyznonexistentquery123");
    expect(typeof result).toBe("string");
    if (result.includes("No results found")) {
      expect(result).toContain("No results found for query");
      expect(result).toContain("Try:");
      expect(result).toContain("Using different keywords");
    }
  });
});

describe("searchCodeExamples", () => {
  it("returns error for empty query", () => {
    expect(searchCodeExamples("")).toContain("❌ Search query cannot be empty");
  });

  it("returns error for invalid limit", () => {
    expect(searchCodeExamples("test", undefined, true, 0)).toContain("❌ Limit must be between 1 and 20");
    expect(searchCodeExamples("test", undefined, true, 21)).toContain("❌ Limit must be between 1 and 20");
  });

  it("returns error for negative offset", () => {
    expect(searchCodeExamples("test", undefined, true, 5, -1)).toContain("❌ Offset cannot be negative");
  });

  it("returns error for invalid language", () => {
    const result = searchCodeExamples("test", "invalid_lang");
    expect(result).toContain("❌ Invalid language");
    expect(result).toContain("php, go, python, java, csharp, javascript, typescript");
  });

  it("performs basic code search", () => {
    const result = searchCodeExamples("check");
    expect(typeof result).toBe("string");
    expect(result).toContain("## Code Examples");
    expect(result).toContain("**Search:** `check`");
  });

  it("performs search with language filter", () => {
    const result = searchCodeExamples("client", "php");
    expect(typeof result).toBe("string");
    expect(result).toContain("## Code Examples");
    expect(result).toContain("**Language:** php");
  });

  it("includes context when requested", () => {
    const result = searchCodeExamples("new Client", undefined, true);
    expect(typeof result).toBe("string");
    if (!result.includes("No code examples found")) {
      expect(result).toContain("## Code Examples");
    }
  });

  it("excludes context when not requested", () => {
    const result = searchCodeExamples("new Client", undefined, false);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Code Examples");
  });

  it("handles pagination properly", () => {
    const result = searchCodeExamples("function", undefined, true, 3, 5);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Code Examples");
    if (!result.includes("No code examples found")) {
      expect(result).toMatch(/\*\*Results:\*\* Showing \d+/);
    }
  });

  it("formats no results message properly", () => {
    const result = searchCodeExamples("xyznonexistentcode123");
    expect(typeof result).toBe("string");
    if (result.includes("No code examples found")) {
      expect(result).toContain("No code examples found for");
      expect(result).toContain("Try:");
      expect(result).toContain("Searching for specific method or class names");
    }
  });

  it("maps language to SDK correctly", () => {
    let result = searchCodeExamples("client", "php");
    expect(typeof result).toBe("string");
    expect(result).toContain("**Language:** php");

    result = searchCodeExamples("client", "javascript");
    expect(typeof result).toBe("string");
    expect(result).toContain("**Language:** javascript");

    result = searchCodeExamples("client", "typescript");
    expect(typeof result).toBe("string");
    expect(result).toContain("**Language:** typescript");
  });
});

describe("findSimilarDocumentation", () => {
  it("returns error for empty content", () => {
    expect(findSimilarDocumentation("")).toContain("❌ Content cannot be empty");
  });

  it("returns error for invalid similarity threshold", () => {
    expect(findSimilarDocumentation("test content", undefined, -0.1)).toContain(
      "❌ Similarity threshold must be between 0.0 and 1.0",
    );
    expect(findSimilarDocumentation("test content", undefined, 1.1)).toContain(
      "❌ Similarity threshold must be between 0.0 and 1.0",
    );
  });

  it("returns error for invalid limit", () => {
    expect(findSimilarDocumentation("test content", undefined, 0.5, 0)).toContain(
      "❌ Limit must be between 1 and 20",
    );
    expect(findSimilarDocumentation("test content", undefined, 0.5, 21)).toContain(
      "❌ Limit must be between 1 and 20",
    );
  });

  it("returns error for invalid SDK", () => {
    const result = findSimilarDocumentation("test content", "invalid_sdk" as "php");
    expect(result).toContain("❌ Invalid SDK");
    expect(result).toContain("php, go, python, java, dotnet, js, laravel");
  });

  it("finds similar documentation", () => {
    const content = "I need to understand how to check permissions in OpenFGA using the check method";
    const result = findSimilarDocumentation(content);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Similar Documentation");
    if (result.includes("No similar documentation found")) {
      expect(result).toContain("Try:");
      expect(result).toContain("Lowering the similarity threshold");
    } else {
      expect(result).toContain("**Similarity Threshold:** 0.5");
    }
  });

  it("finds similar documentation with SDK filter", () => {
    const content = "How do I create a new client instance and connect to OpenFGA?";
    const result = findSimilarDocumentation(content, "php");
    expect(typeof result).toBe("string");
    expect(result).toContain("## Similar Documentation");
    if (result.includes("No similar documentation found")) {
      expect(result).toContain("in SDK: php");
    } else {
      expect(result).toContain("**SDK Filter:** php");
    }
  });

  it("respects similarity threshold", () => {
    const content = "OpenFGA authorization model with user groups";

    const result1 = findSimilarDocumentation(content, undefined, 0.3);
    expect(typeof result1).toBe("string");
    if (result1.includes("No similar documentation found")) {
      expect(result1).toContain("(threshold: 0.3)");
    } else {
      expect(result1).toContain("**Similarity Threshold:** 0.3");
    }

    const result2 = findSimilarDocumentation(content, undefined, 0.9);
    expect(typeof result2).toBe("string");
    if (result2.includes("No similar documentation found")) {
      expect(result2).toContain("(threshold: 0.9)");
    } else {
      expect(result2).toContain("**Similarity Threshold:** 0.9");
    }
  });

  it("limits results properly", () => {
    const content = "OpenFGA client methods and API calls";
    const result = findSimilarDocumentation(content, undefined, 0.3, 3);
    expect(typeof result).toBe("string");
    if (!result.includes("No similar documentation found")) {
      const matches = result.match(/### \d+\./g) ?? [];
      expect(matches.length).toBeLessThanOrEqual(3);
    }
  });

  it("formats no results message properly", () => {
    const content = "xyzabc123 nonexistent random gibberish content that will not match anything";
    const result = findSimilarDocumentation(content, undefined, 0.95);
    expect(typeof result).toBe("string");
    if (result.includes("No similar documentation found")) {
      expect(result).toContain("No similar documentation found");
      expect(result).toContain("Try:");
      expect(result).toContain("Lowering the similarity threshold");
    }
  });

  it("handles content with code blocks", () => {
    const content = `I'm trying to use the check method like this:
\`\`\`php
$client->check($request);
\`\`\`
But I'm getting an error. How should I properly call the check method?`;
    const result = findSimilarDocumentation(content);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Similar Documentation");
  });

  it("extracts key terms properly", () => {
    const content = "OpenFGA authorization tuples and relationships with user groups and permissions";
    const result = findSimilarDocumentation(content);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Similar Documentation");
  });
});

describe("edge cases", () => {
  it("handles whitespace-only query gracefully", () => {
    expect(searchDocumentation("   ")).toContain("❌ Search query cannot be empty");
    expect(searchCodeExamples("\t\n")).toContain("❌ Search query cannot be empty");
    expect(findSimilarDocumentation("   ")).toContain("❌ Content cannot be empty");
  });

  it("handles very long queries gracefully", () => {
    const longQuery = "test ".repeat(100);

    let result = searchDocumentation(longQuery);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Documentation Search Results");

    result = searchCodeExamples(longQuery);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Code Examples");
  });

  it("handles special characters in queries", () => {
    const specialQuery = "check() && expand()";

    let result = searchDocumentation(specialQuery);
    expect(typeof result).toBe("string");
    expect(result).not.toContain("❌");

    result = searchCodeExamples(specialQuery);
    expect(typeof result).toBe("string");
    expect(result).not.toContain("❌");
  });

  it("handles Unicode characters in content", () => {
    const unicodeContent = "OpenFGA 授权 权限 检查 用户组 🔐";
    const result = findSimilarDocumentation(unicodeContent);
    expect(typeof result).toBe("string");
    expect(result).toContain("## Similar Documentation");
  });

  it("handles null SDK parameter correctly", () => {
    let result = searchDocumentation("test", undefined);
    expect(typeof result).toBe("string");
    expect(result).not.toContain("**SDK Filter:**");

    result = searchCodeExamples("test", undefined);
    expect(typeof result).toBe("string");
    const headerSection = result.split("\n").slice(0, 10).join("\n");
    expect(headerSection).not.toContain("**Language:**");

    result = findSimilarDocumentation("test content", undefined);
    expect(typeof result).toBe("string");
    expect(result).not.toContain("**SDK Filter:**");
  });
});

describe("markdown formatting", () => {
  it("generates valid markdown headers", () => {
    const result = searchDocumentation("test");
    expect(result).toMatch(/^## /m);
    expect(result).toContain("**Query:**");
  });

  it("formats code blocks properly", () => {
    const result = searchCodeExamples("client");
    expect(typeof result).toBe("string");
    if (!result.includes("No code examples found")) {
      expect(result).toContain("## Code Examples");
    }
  });

  it("includes pagination navigation when needed", () => {
    const result = searchDocumentation("test", undefined, "content", 5, 0);
    expect(typeof result).toBe("string");
    if (result.includes("Page:") && result.includes(" of ")) {
      const match = result.match(/Page: \d+ of (\d+)/);
      if (match) {
        const totalPages = parseInt(match[1], 10);
        if (totalPages > 1) {
          expect(result).toContain("### Pagination");
        }
      }
    }
  });

  it("formats similarity scores as percentages", () => {
    const result = findSimilarDocumentation("OpenFGA check method");
    expect(typeof result).toBe("string");
    if (!result.includes("No similar documentation found")) {
      if (result.includes("**Similarity Score:**")) {
        expect(result).toMatch(/\*\*Similarity Score:\*\* \d+%/);
      }
    }
  });
});
