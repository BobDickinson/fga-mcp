const DEFAULT_CHUNK_SIZE = 3000;
const MIN_CHUNK_SIZE = 500;

export type CodeBlockChunk = { type: "code" | "text"; language: string | null; content: string };
export type HeaderChunk = { header: string | null; content: string; level: number };
export type SourceBlockChunk = { source: string | null; content: string; type: string };
export type CodeExample = { language: string; code: string; description: string; line_number: number };
export type SmartChunk = { content: string; metadata: Record<string, unknown> } | string;

export class DocumentationChunker {
  chunkByCodeBlocks(content: string): CodeBlockChunk[] {
    const chunks: CodeBlockChunk[] = [];
    const lines = content.split("\n");
    let currentChunk: string[] = [];
    let inCodeBlock = false;
    let codeLanguage: string | null = null;
    let textBuffer: string[] = [];

    for (const line of lines) {
      const codeMatch = line.match(/^```(\w*)$/);
      if (codeMatch) {
        if (inCodeBlock) {
          currentChunk.push(line);
          chunks.push({ type: "code", language: codeLanguage, content: currentChunk.join("\n") });
          currentChunk = [];
          inCodeBlock = false;
          codeLanguage = null;
        } else {
          if (textBuffer.length > 0) {
            chunks.push({ type: "text", language: null, content: textBuffer.join("\n") });
            textBuffer = [];
          }
          inCodeBlock = true;
          codeLanguage = codeMatch[1] ? codeMatch[1] : "plaintext";
          currentChunk = [line];
        }
      } else if (inCodeBlock) {
        currentChunk.push(line);
      } else {
        textBuffer.push(line);
        if (textBuffer.length >= 50) {
          chunks.push({ type: "text", language: null, content: textBuffer.join("\n") });
          textBuffer = [];
        }
      }
    }

    if (textBuffer.length > 0) {
      chunks.push({ type: "text", language: null, content: textBuffer.join("\n") });
    }
    if (currentChunk.length > 0) {
      chunks.push({
        type: inCodeBlock ? "code" : "text",
        language: codeLanguage,
        content: currentChunk.join("\n"),
      });
    }
    return chunks;
  }

  chunkByHeaders(content: string): HeaderChunk[] {
    if (content === "") return [];
    const chunks: HeaderChunk[] = [];
    const lines = content.split("\n");
    let currentChunk: string[] = [];
    let currentHeader: string | null = null;
    let currentLevel = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6}) (.+)$/);
      if (headerMatch) {
        if (currentChunk.length > 0) {
          chunks.push({ header: currentHeader, content: currentChunk.join("\n"), level: currentLevel });
        }
        currentHeader = headerMatch[2].trim();
        currentLevel = headerMatch[1].length;
        currentChunk = [line];
      } else {
        currentChunk.push(line);
      }
    }

    chunks.push({ header: currentHeader, content: currentChunk.join("\n"), level: currentLevel });
    return chunks;
  }

  chunkByLines(content: string, maxLines = 100): string[] {
    const lines = content.split("\n");
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const line of lines) {
      currentChunk.push(line);
      if (currentChunk.length >= maxLines) {
        chunks.push(currentChunk.join("\n"));
        currentChunk = currentChunk.slice(-10);
      }
    }

    if (currentChunk.length > 0) chunks.push(currentChunk.join("\n"));
    return chunks;
  }

  chunkBySize(content: string, maxSize = DEFAULT_CHUNK_SIZE): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const sentences = this.splitIntoSentences(content);

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxSize && currentChunk.length > MIN_CHUNK_SIZE) {
        chunks.push(currentChunk.trim());
        const overlapText = this.getOverlapText(currentChunk);
        currentChunk = `${overlapText} ${sentence}`;
      } else {
        currentChunk += ` ${sentence}`;
      }
    }

    if (currentChunk.trim() !== "") chunks.push(currentChunk.trim());
    return chunks;
  }

  chunkBySourceBlocks(content: string): SourceBlockChunk[] {
    const chunks: SourceBlockChunk[] = [];
    const lines = content.split("\n");
    let currentChunk: string[] = [];
    let inSourceBlock = false;
    let sourceFile: string | null = null;

    for (const line of lines) {
      const sourceMatch = line.match(/^<!-- Source: (.+) -->$/);
      if (sourceMatch) {
        if (currentChunk.length > 0) {
          chunks.push({ source: sourceFile, content: currentChunk.join("\n"), type: "source_block" });
        }
        inSourceBlock = true;
        sourceFile = sourceMatch[1].trim();
        currentChunk = [];
        continue;
      }

      if (/^<!-- End of .+ -->$/.test(line)) {
        if (currentChunk.length > 0) {
          chunks.push({ source: sourceFile, content: currentChunk.join("\n"), type: "source_block" });
        }
        inSourceBlock = false;
        sourceFile = null;
        currentChunk = [];
        continue;
      }

      currentChunk.push(line);
    }

    if (currentChunk.length > 0) {
      chunks.push({
        source: sourceFile,
        content: currentChunk.join("\n"),
        type: inSourceBlock ? "source_block" : "general",
      });
    }
    return chunks;
  }

  extractCodeExamples(content: string): CodeExample[] {
    const examples: CodeExample[] = [];
    const lines = content.split("\n");
    let inCodeBlock = false;
    let currentCode: string[] = [];
    let codeLanguage: string | null = null;
    let precedingText = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const codeMatch = line.match(/^```(\w*)$/);
      if (codeMatch) {
        if (inCodeBlock) {
          examples.push({
            language: codeLanguage ?? "plaintext",
            code: currentCode.join("\n"),
            description: this.extractDescription(precedingText),
            line_number: i - currentCode.length,
          });
          currentCode = [];
          inCodeBlock = false;
          codeLanguage = null;
          precedingText = "";
        } else {
          inCodeBlock = true;
          codeLanguage = codeMatch[1] ? codeMatch[1] : "plaintext";
          precedingText = this.getPrecedingText(lines, i, 5);
        }
      } else if (inCodeBlock) {
        currentCode.push(line);
      }
    }

    return examples;
  }

  smartChunk(content: string, options: Record<string, unknown> = {}): SmartChunk[] {
    const maxSize = typeof options.max_size === "number" ? options.max_size : DEFAULT_CHUNK_SIZE;
    const preserveHeaders = options.preserve_headers !== false;
    const includeMetadata = options.include_metadata !== false;

    const chunks: SmartChunk[] = [];
    const lines = content.split("\n");
    let currentChunk: string[] = [];
    let currentMetadata: Record<string, unknown> = {};
    let inCodeBlock = false;
    let currentHeader: string | null = null;
    let currentSize = 0;

    for (const line of lines) {
      const lineSize = line.length;
      if (/^```/.test(line)) inCodeBlock = !inCodeBlock;

      const headerMatch = !inCodeBlock ? line.match(/^(#{1,6}) (.+)$/) : null;
      if (headerMatch) {
        if (currentSize > MIN_CHUNK_SIZE) {
          this.finalizeChunk(chunks, currentChunk, currentMetadata, includeMetadata);
          currentChunk = [];
          currentSize = 0;
        }
        currentHeader = headerMatch[2].trim();
        currentMetadata = { header: currentHeader, header_level: headerMatch[1].length };
      }

      if (lineSize > maxSize && !inCodeBlock) {
        if (currentChunk.length > 0) this.finalizeChunk(chunks, currentChunk, currentMetadata, includeMetadata);
        const sentenceChunks = this.chunkBySize(line, maxSize);
        for (let i = 0; i < sentenceChunks.length - 1; i++) {
          this.finalizeChunk(chunks, [sentenceChunks[i]], currentMetadata, includeMetadata);
        }
        currentChunk = [sentenceChunks[sentenceChunks.length - 1]];
        currentSize = currentChunk[0].length;
      } else {
        currentChunk.push(line);
        currentSize += lineSize;
        if (currentSize >= maxSize && !inCodeBlock) {
          this.finalizeChunk(chunks, currentChunk, currentMetadata, includeMetadata);
          if (preserveHeaders && currentHeader) {
            const level = (currentMetadata.header_level as number) ?? 2;
            currentChunk = [`${"#".repeat(level)} ${currentHeader} (continued)`];
            currentSize = currentChunk[0].length;
          } else {
            currentChunk = [];
            currentSize = 0;
          }
        }
      }
    }

    if (currentChunk.length > 0) this.finalizeChunk(chunks, currentChunk, currentMetadata, includeMetadata);
    return chunks;
  }

  private extractDescription(text: string): string {
    const trimmed = text.trim();
    const descMatch = trimmed.match(/(?:Example|Usage|Sample|Code):\s*(.+)$/i);
    if (descMatch) return descMatch[1].trim();
    const sentences = this.splitIntoSentences(trimmed);
    return sentences[sentences.length - 1] ?? "";
  }

  private finalizeChunk(
    chunks: SmartChunk[],
    lines: string[],
    metadata: Record<string, unknown>,
    includeMetadata: boolean,
  ): void {
    const content = lines.join("\n");
    if (includeMetadata) {
      chunks.push({
        content,
        metadata: { ...metadata, size: content.length, line_count: lines.length },
      });
    } else {
      chunks.push(content);
    }
  }

  private getOverlapText(chunk: string): string {
    return chunk.split(" ").slice(-20).join(" ");
  }

  private getPrecedingText(lines: string[], currentIndex: number, lookback = 5): string {
    const start = Math.max(0, currentIndex - lookback);
    return lines
      .slice(start, currentIndex)
      .filter((line) => line.trim() !== "")
      .join(" ");
  }

  private splitIntoSentences(text: string): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.length > 0 ? sentences : [text];
  }
}

let chunkerInstance: DocumentationChunker | null = null;

export function getDocumentationChunker(): DocumentationChunker {
  if (!chunkerInstance) chunkerInstance = new DocumentationChunker();
  return chunkerInstance;
}
