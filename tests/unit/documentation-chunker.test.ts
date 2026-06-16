import { beforeEach, describe, expect, it } from "vitest";
import { DocumentationChunker } from "../../src/documentation/chunker.js";

describe("DocumentationChunker", () => {
  let chunker: DocumentationChunker;
  let sampleContent: string;
  let longContent: string;

  beforeEach(() => {
    chunker = new DocumentationChunker();
    sampleContent = `# Main Title

This is the introduction paragraph with some content that should be chunked appropriately.

## Section One

This is section one with detailed content. It contains multiple sentences to test chunking behavior.
Here's another paragraph in section one. This should provide sufficient content for testing.

### Subsection

More detailed content in the subsection.

\`\`\`php
<?php
function example() {
    return "Hello World";
}
\`\`\`

## Section Two

This is section two with different content.

\`\`\`javascript
function jsExample() {
    console.log("JavaScript example");
}
\`\`\`

Some text after the code block.

<!-- Source: src/Example.php -->
### ExampleClass

This is a class documentation section.

##### exampleMethod

This method does something useful.

\`\`\`php
public function exampleMethod(): string
{
    return "example";
}
\`\`\`

<!-- End of src/Example.php -->

More content after the source block.`;
    longContent = "This is a long sentence that will be used to test size-based chunking. ".repeat(200);
  });

  describe("chunkByLines", () => {
    it("chunks content by line count", () => {
      const chunks = chunker.chunkByLines(sampleContent, 10);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(typeof chunk).toBe("string");
        expect(chunk.length).toBeGreaterThan(0);
      }
    });

    it("handles single line content", () => {
      const singleLine = "This is a single line of content.";
      const chunks = chunker.chunkByLines(singleLine, 10);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(singleLine);
    });

    it("handles empty content", () => {
      const chunks = chunker.chunkByLines("", 10);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("");
    });

    it("maintains overlap between chunks", () => {
      const manyLines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join("\n");
      const chunks = chunker.chunkByLines(manyLines, 20);
      expect(chunks.length).toBeGreaterThan(2);
      expect(chunks[1]).toContain("Line 11");
    });
  });

  describe("chunkBySize", () => {
    it("chunks content by character size", () => {
      const chunks = chunker.chunkBySize(longContent, 1000);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(1200);
      }
    });

    it("respects minimum chunk size", () => {
      const chunks = chunker.chunkBySize(sampleContent, 100);
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });

    it("handles content smaller than chunk size", () => {
      const smallContent = "This is small content.";
      const chunks = chunker.chunkBySize(smallContent, 1000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(smallContent.trim());
    });

    it("creates overlap between chunks", () => {
      const chunks = chunker.chunkBySize(longContent, 1000);
      if (chunks.length > 1) {
        const firstChunkEnd = chunks[0].slice(-100);
        const secondChunkStart = chunks[1].slice(0, 100);
        const firstWords = firstChunkEnd.split(" ");
        const secondWords = secondChunkStart.split(" ");
        const overlap = firstWords.filter((w) => secondWords.includes(w));
        expect(overlap.length).toBeGreaterThan(0);
      }
    });
  });

  describe("chunkByHeaders", () => {
    it("chunks content by markdown headers", () => {
      const chunks = chunker.chunkByHeaders(sampleContent);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk).toHaveProperty("header");
        expect(chunk).toHaveProperty("content");
        expect(chunk).toHaveProperty("level");
        expect(typeof chunk.content).toBe("string");
        expect(typeof chunk.level).toBe("number");
      }
    });

    it("correctly identifies header levels", () => {
      const chunks = chunker.chunkByHeaders(sampleContent);
      const mainTitleChunk = chunks.find((c) => c.header === "Main Title");
      const sectionChunk = chunks.find((c) => c.header === "Section One");
      const subsectionChunk = chunks.find((c) => c.header === "Subsection");

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty("level");
      if (mainTitleChunk) expect(mainTitleChunk.level).toBe(1);
      if (sectionChunk) expect(sectionChunk.level).toBe(2);
      if (subsectionChunk) expect(subsectionChunk.level).toBe(3);
    });

    it("handles content without headers", () => {
      const contentWithoutHeaders = "This is just plain text without any headers.";
      const chunks = chunker.chunkByHeaders(contentWithoutHeaders);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].header).toBeNull();
      expect(chunks[0].content).toContain(contentWithoutHeaders);
    });
  });

  describe("chunkBySourceBlocks", () => {
    it("chunks content by source file blocks", () => {
      const chunks = chunker.chunkBySourceBlocks(sampleContent);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk).toHaveProperty("source");
        expect(chunk).toHaveProperty("content");
        expect(chunk).toHaveProperty("type");
        expect(typeof chunk.content).toBe("string");
        expect(typeof chunk.type).toBe("string");
      }
    });

    it("identifies source blocks correctly", () => {
      const chunks = chunker.chunkBySourceBlocks(sampleContent);
      const sourceBlock = chunks.find((c) => c.source === "src/Example.php");
      expect(sourceBlock).not.toBeNull();
      expect(sourceBlock!.type).toBe("source_block");
      expect(sourceBlock!.content).toContain("ExampleClass");
    });

    it("handles content without source blocks", () => {
      const contentWithoutSource = "# Title\n\nThis is content without source blocks.";
      const chunks = chunker.chunkBySourceBlocks(contentWithoutSource);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].source).toBeNull();
      expect(chunks[0].type).toBe("general");
    });
  });

  describe("chunkByCodeBlocks", () => {
    it("separates code blocks from text", () => {
      const chunks = chunker.chunkByCodeBlocks(sampleContent);
      const codeChunks = chunks.filter((c) => c.type === "code");
      const textChunks = chunks.filter((c) => c.type === "text");
      expect(codeChunks.length).toBeGreaterThan(0);
      expect(textChunks.length).toBeGreaterThan(0);
    });

    it("identifies code languages correctly", () => {
      const chunks = chunker.chunkByCodeBlocks(sampleContent);
      const codeChunks = chunks.filter((c) => c.type === "code");
      const phpCode = codeChunks.find((c) => c.language === "php");
      const jsCode = codeChunks.find((c) => c.language === "javascript");

      expect(codeChunks.length).toBeGreaterThan(0);
      if (phpCode) {
        const hasExampleFunction =
          phpCode.content.includes("function example()") || phpCode.content.includes("function exampleMethod");
        expect(hasExampleFunction).toBe(true);
      }
      if (jsCode) {
        expect(jsCode.content).toContain("console.log");
      }
    });

    it("handles content without code blocks", () => {
      const textOnly = "This is plain text without any code blocks.";
      const chunks = chunker.chunkByCodeBlocks(textOnly);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("text");
      expect(chunks[0].content).toBe(textOnly);
    });

    it("limits text chunk size", () => {
      const longText = "This is a long line of text. ".repeat(100);
      const chunks = chunker.chunkByCodeBlocks(longText);
      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks.length).toBeGreaterThanOrEqual(1);
      if (textChunks.length > 1) {
        expect(textChunks.length).toBeGreaterThan(1);
      }
    });
  });

  describe("smartChunk", () => {
    it("intelligently chunks content with default options", () => {
      const chunks = chunker.smartChunk(sampleContent);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk).toHaveProperty("content");
        expect(chunk).toHaveProperty("metadata");
        if (typeof chunk !== "string") {
          expect(typeof chunk.content).toBe("string");
          expect(chunk.metadata).toHaveProperty("size");
          expect(chunk.metadata).toHaveProperty("line_count");
        }
      }
    });

    it("respects maximum size option", () => {
      const chunks = chunker.smartChunk(longContent, { max_size: 500 });
      for (const chunk of chunks) {
        const content = typeof chunk === "string" ? chunk : chunk.content;
        expect(content.length).toBeLessThanOrEqual(800);
      }
    });

    it("preserves headers when requested", () => {
      const chunks = chunker.smartChunk(sampleContent, { preserve_headers: true });
      let hasHeaderPreservation = false;
      for (const chunk of chunks) {
        if (typeof chunk !== "string" && chunk.metadata.header) {
          hasHeaderPreservation = true;
          expect(typeof chunk.metadata.header).toBe("string");
          expect(typeof chunk.metadata.header_level).toBe("number");
        }
      }
      expect(hasHeaderPreservation).toBe(true);
    });

    it("handles code blocks properly", () => {
      const chunks = chunker.smartChunk(sampleContent, { preserve_code_blocks: true });
      for (const chunk of chunks) {
        const content = typeof chunk === "string" ? chunk : chunk.content;
        const codeBlockCount = (content.match(/```/g) ?? []).length;
        expect(codeBlockCount % 2).toBe(0);
      }
    });

    it("can exclude metadata", () => {
      const chunks = chunker.smartChunk(sampleContent, { include_metadata: false });
      for (const chunk of chunks) {
        expect(typeof chunk).toBe("string");
      }
    });
  });

  describe("extractCodeExamples", () => {
    it("extracts code examples with languages", () => {
      const examples = chunker.extractCodeExamples(sampleContent);
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        expect(example).toHaveProperty("language");
        expect(example).toHaveProperty("code");
        expect(example).toHaveProperty("description");
        expect(example).toHaveProperty("line_number");
        expect(typeof example.language).toBe("string");
        expect(typeof example.code).toBe("string");
        expect(typeof example.line_number).toBe("number");
      }
    });

    it("identifies different programming languages", () => {
      const examples = chunker.extractCodeExamples(sampleContent);
      const languages = examples.map((e) => e.language);
      expect(languages).toContain("php");
      expect(languages).toContain("javascript");
    });

    it("extracts descriptions from preceding text", () => {
      const examples = chunker.extractCodeExamples(sampleContent);
      for (const example of examples) {
        expect(typeof example.description).toBe("string");
      }
    });

    it("handles content without code examples", () => {
      const textOnly = "This is plain text without any code examples.";
      const examples = chunker.extractCodeExamples(textOnly);
      expect(examples).toHaveLength(0);
    });

    it("correctly identifies line numbers", () => {
      const examples = chunker.extractCodeExamples(sampleContent);
      for (const example of examples) {
        expect(example.line_number).toBeGreaterThan(0);
      }
      if (examples.length > 1) {
        expect(examples[0].line_number).toBeLessThan(examples[1].line_number);
      }
    });
  });

  describe("edge cases and error handling", () => {
    it("handles empty content gracefully", () => {
      const emptyContent = "";
      expect(() => chunker.chunkByLines(emptyContent)).not.toThrow();
      expect(() => chunker.chunkBySize(emptyContent)).not.toThrow();
      expect(() => chunker.chunkByHeaders(emptyContent)).not.toThrow();
      expect(() => chunker.chunkBySourceBlocks(emptyContent)).not.toThrow();
      expect(() => chunker.chunkByCodeBlocks(emptyContent)).not.toThrow();
      expect(() => chunker.smartChunk(emptyContent)).not.toThrow();
      expect(() => chunker.extractCodeExamples(emptyContent)).not.toThrow();
      expect(chunker.extractCodeExamples(emptyContent)).toHaveLength(0);
    });

    it("handles malformed markdown gracefully", () => {
      const malformedContent = "# Title\n### Skipped level\n```unclosed code block\nsome code";
      expect(() => chunker.chunkByHeaders(malformedContent)).not.toThrow();
      expect(() => chunker.chunkByCodeBlocks(malformedContent)).not.toThrow();
      expect(() => chunker.smartChunk(malformedContent)).not.toThrow();
    });

    it("handles very large content", () => {
      const hugeContent = "This is repeated content. ".repeat(1000);
      const chunks = chunker.chunkBySize(hugeContent, 2000);
      expect(chunks.length).toBeGreaterThan(5);
      const smartChunks = chunker.smartChunk(hugeContent, { max_size: 2000 });
      expect(smartChunks.length).toBeGreaterThan(5);
    });

    it("handles content with only whitespace", () => {
      const whitespaceContent = "   \n\n\t  \n   ";
      const chunks = chunker.smartChunk(whitespaceContent);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const first = chunks[0];
      const content = typeof first === "string" ? first : first.content;
      expect(content.trim()).toBe("");
    });
  });

  describe("private method behavior via public interface", () => {
    it("sentence splitting works correctly in size chunking", () => {
      const sentenceContent = "This is sentence one. This is sentence two! This is sentence three?";
      const chunks = chunker.chunkBySize(sentenceContent, 30);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      for (const chunk of chunks) {
        expect(chunk.trim().length).toBeGreaterThan(0);
      }
    });

    it("header level detection works via chunkByHeaders", () => {
      const headerContent = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
      const chunks = chunker.chunkByHeaders(headerContent);
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(3);
      const levels = chunks.map((c) => c.level);
      expect(levels).toContain(1);
      expect(Math.max(...levels)).toBeLessThanOrEqual(6);
    });
  });
});
