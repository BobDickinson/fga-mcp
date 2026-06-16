import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHUNK_SIZE_LIMIT = 5000;
const DOCS_PATH = join(fileURLToPath(new URL(".", import.meta.url)), "../../docs");

export type ChunkMetadata = {
  section: string | null;
  class: string | null;
  method: string | null;
  line_count: number;
  size_bytes: number;
};

export type DocumentationChunk = {
  id: string;
  sdk: string;
  content: string;
  metadata: ChunkMetadata;
  prev_chunk?: string;
  next_chunk?: string;
};

export type SearchChunkResult = {
  chunk_id: string;
  sdk: string;
  score: number;
  preview: string;
  metadata: ChunkMetadata;
};

type SdkIndex = {
  name: string;
  file: string;
  sections: Record<string, { line_start: number; chunks: string[] }>;
  classes: Record<
    string,
    {
      namespace: string | null;
      methods: Record<
        string,
        {
          signature: string | null;
          parameters: unknown[];
          returns: string | null;
          chunk_id: string | null;
        }
      >;
      chunk_id: string | null;
    }
  >;
  chunks: string[];
  source: string | null;
  generated: string | null;
};

class DocumentationIndex {
  private chunks: Record<string, DocumentationChunk> = {};
  private index: Record<string, SdkIndex> = {};
  private initialized = false;
  private sdkList: string[] = [];

  getChunk(chunkId: string): DocumentationChunk | null {
    this.ensureInitialized();
    return this.chunks[chunkId] ?? null;
  }

  getChunkById(chunkId: string): DocumentationChunk | null {
    return this.chunks[chunkId] ?? null;
  }

  getChunksBySection(sdk: string, section: string): DocumentationChunk[] {
    this.ensureInitialized();
    const sdkKey = sdk.toLowerCase();
    const sectionData = this.index[sdkKey]?.sections[section];
    if (!sectionData) return [];

    return sectionData.chunks
      .map((id) => this.chunks[id])
      .filter((chunk): chunk is DocumentationChunk => chunk !== undefined);
  }

  getClassDocumentation(
    sdk: string,
    className: string,
  ): {
    class: string;
    sdk: string;
    namespace: string | null;
    methods: Record<string, unknown>;
    content: string;
    metadata: ChunkMetadata;
  } | null {
    this.ensureInitialized();
    const sdkKey = sdk.toLowerCase();
    const classInfo = this.index[sdkKey]?.classes[className];
    if (!classInfo?.chunk_id) return null;

    const chunk = this.chunks[classInfo.chunk_id];
    if (!chunk) return null;

    return {
      class: className,
      sdk: sdkKey,
      namespace: classInfo.namespace,
      methods: classInfo.methods,
      content: chunk.content,
      metadata: chunk.metadata,
    };
  }

  getMethodDocumentation(
    sdk: string,
    className: string,
    methodName: string,
  ): {
    method: string;
    class: string;
    sdk: string;
    signature: string | null;
    parameters: unknown[];
    returns: string | null;
    content: string;
  } | null {
    const classDoc = this.getClassDocumentation(sdk, className);
    if (!classDoc?.methods[methodName]) return null;

    const methodInfo = classDoc.methods[methodName] as {
      signature: string | null;
      parameters: unknown[];
      returns: string | null;
      chunk_id: string | null;
    };

    if (!methodInfo.chunk_id) return null;
    const chunk = this.chunks[methodInfo.chunk_id];
    if (!chunk) return null;

    return {
      method: methodName,
      class: className,
      sdk: sdk.toLowerCase(),
      signature: methodInfo.signature,
      parameters: methodInfo.parameters,
      returns: methodInfo.returns,
      content: chunk.content,
    };
  }

  getSdkList(): string[] {
    this.ensureInitialized();
    return this.sdkList;
  }

  getSdkOverview(sdk: string): {
    sdk: string;
    name: string;
    file: string;
    sections: string[];
    classes: string[];
    total_chunks: number;
    source: string | null;
    generated: string | null;
  } | null {
    this.ensureInitialized();
    const sdkKey = sdk.toLowerCase();
    const sdkData = this.index[sdkKey];
    if (!sdkData) return null;

    return {
      sdk: sdkKey,
      name: sdkData.name,
      file: sdkData.file,
      sections: Object.keys(sdkData.sections),
      classes: Object.keys(sdkData.classes),
      total_chunks: sdkData.chunks.length,
      source: sdkData.source,
      generated: sdkData.generated,
    };
  }

  initialize(): void {
    if (this.initialized) return;
    this.scanDocumentationFiles();
    this.buildIndex();
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  searchChunks(query: string, sdk?: string | null, limit = 10): SearchChunkResult[] {
    this.ensureInitialized();
    const results: SearchChunkResult[] = [];
    const queryLower = query.toLowerCase();

    for (const [chunkId, chunk] of Object.entries(this.chunks)) {
      if (sdk && chunk.sdk !== sdk.toLowerCase()) continue;

      const score = this.calculateRelevanceScore(queryLower, chunk.content.toLowerCase(), chunk.metadata);
      if (score <= 0) continue;

      results.push({
        chunk_id: chunkId,
        sdk: chunk.sdk,
        score,
        preview: this.generatePreview(chunk.content, query),
        metadata: chunk.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private buildIndex(): void {
    for (const sdkData of Object.values(this.index)) {
      const chunkIds = sdkData.chunks;
      for (let i = 0; i < chunkIds.length; i++) {
        const currentId = chunkIds[i];
        const chunk = this.chunks[currentId];
        if (!chunk) continue;
        if (i > 0) chunk.prev_chunk = chunkIds[i - 1];
        if (i < chunkIds.length - 1) chunk.next_chunk = chunkIds[i + 1];
      }
    }
  }

  private calculateRelevanceScore(query: string, content: string, metadata: ChunkMetadata): number {
    let score = 0;
    const queryTerms = query.split(" ").filter(Boolean);

    for (const term of queryTerms) {
      score += (content.split(term).length - 1) * 1.0;
      if (metadata.class && metadata.class.toLowerCase().includes(term)) score += 5.0;
      if (metadata.method && metadata.method.toLowerCase().includes(term)) score += 3.0;
      if (metadata.section && metadata.section.toLowerCase().includes(term)) score += 2.0;
    }

    return score;
  }

  private createChunk(
    sdk: string,
    lines: string[],
    section: string | null,
    className: string | null,
    method: string | null,
  ): void {
    const content = lines.join("\n");
    const chunkId = `${sdk}_chunk_${String(Object.keys(this.chunks).length).padStart(6, "0")}`;
    const metadata: ChunkMetadata = {
      section,
      class: className,
      method,
      line_count: lines.length,
      size_bytes: content.length,
    };

    this.chunks[chunkId] = { id: chunkId, sdk, content, metadata };
    this.index[sdk].chunks.push(chunkId);

    if (section && this.index[sdk].sections[section]) {
      this.index[sdk].sections[section].chunks.push(chunkId);
    }

    if (className && this.index[sdk].classes[className]) {
      if (!this.index[sdk].classes[className].chunk_id) {
        this.index[sdk].classes[className].chunk_id = chunkId;
      }
      if (method && this.index[sdk].classes[className].methods[method]) {
        this.index[sdk].classes[className].methods[method].chunk_id = chunkId;
      }
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) this.initialize();
  }

  private extractClassNameFromSource(sourceFile: string): string | null {
    const match = sourceFile.match(/\/([^/]+)\.(php|go|py|java|cs|js|ts)$/);
    return match ? match[1] : null;
  }

  private generatePreview(content: string, query: string, previewLength = 200): string {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    let position = contentLower.indexOf(queryLower);

    if (position === -1) {
      for (const term of queryLower.split(" ")) {
        position = contentLower.indexOf(term);
        if (position !== -1) break;
      }
    }

    if (position === -1) position = 0;

    const start = Math.max(0, position - 50);
    const end = Math.min(content.length, position + previewLength);
    let preview = content.slice(start, end);
    if (start > 0) preview = "..." + preview.trimStart();
    if (end < content.length) preview = preview.trimEnd() + "...";
    return preview;
  }

  private parseDocumentationFile(file: string, sdk: string): void {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    let currentSection: string | null = null;
    let currentClass: string | null = null;
    let currentMethod: string | null = null;
    let buffer: string[] = [];
    let inSourceBlock = false;

    for (const line of lines) {
      const compiledFrom = line.match(/^> Compiled from: (.+)$/);
      if (compiledFrom) this.index[sdk].source = compiledFrom[1].trim();

      const generated = line.match(/^> Generated: (.+)$/);
      if (generated) this.index[sdk].generated = generated[1].trim();

      const sourceBlock = line.match(/^<!-- Source: (.+) -->$/);
      if (sourceBlock) {
        if (buffer.length > 0) {
          this.createChunk(sdk, buffer, currentSection, currentClass, currentMethod);
          buffer = [];
        }
        inSourceBlock = true;
        currentClass = this.extractClassNameFromSource(sourceBlock[1].trim());
        continue;
      }

      if (/^<!-- End of .+ -->$/.test(line)) {
        if (buffer.length > 0) {
          this.createChunk(sdk, buffer, currentSection, currentClass, currentMethod);
          buffer = [];
        }
        inSourceBlock = false;
        currentClass = null;
        currentMethod = null;
        continue;
      }

      const sectionMatch = line.match(/^## (.+)$/);
      if (sectionMatch) {
        if (buffer.length > 0) {
          this.createChunk(sdk, buffer, currentSection, currentClass, currentMethod);
          buffer = [];
        }
        currentSection = sectionMatch[1].trim();
        if (currentSection && !this.index[sdk].sections[currentSection]) {
          this.index[sdk].sections[currentSection] = { line_start: 0, chunks: [] };
        }
      }

      const classMatch = line.match(/^### (.+)$/);
      if (classMatch && inSourceBlock) {
        currentClass = classMatch[1].trim();
        if (currentClass && !this.index[sdk].classes[currentClass]) {
          this.index[sdk].classes[currentClass] = {
            namespace: null,
            methods: {},
            chunk_id: null,
          };
        }
      }

      if (currentClass) {
        const methodMatch = line.match(/^##### (.+)$/);
        if (methodMatch) {
          currentMethod = methodMatch[1].trim();
          if (currentMethod && !this.index[sdk].classes[currentClass].methods[currentMethod]) {
            this.index[sdk].classes[currentClass].methods[currentMethod] = {
              signature: null,
              parameters: [],
              returns: null,
              chunk_id: null,
            };
          }
        }
      }

      buffer.push(line);
      if (buffer.length >= CHUNK_SIZE_LIMIT) {
        this.createChunk(sdk, buffer, currentSection, currentClass, currentMethod);
        buffer = [];
      }
    }

    if (buffer.length > 0) {
      this.createChunk(sdk, buffer, currentSection, currentClass, currentMethod);
    }
  }

  private parseGeneralDocumentation(file: string, key: string): void {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    let currentSection: string | null = null;
    let buffer: string[] = [];
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const sectionMatch = line.match(/^(##|###) (.+)$/);
      if (sectionMatch) {
        if (buffer.length > 0) {
          this.createChunk(key, buffer, currentSection, null, null);
          buffer = [];
        }

        let section = sectionMatch[2].trim();
        section = section.replace(/<ProductName[^>]*\/>/g, "OpenFGA");
        section = section.replace(/\s*\{[^}]*\}\s*/g, " ");
        section = section.replace(/[<>]/g, "");
        section = section.replace(/\s+/g, " ").trim();
        if (!section) {
          section = sectionMatch[2].trim().replace(/[<>{}/]/g, "").trim() || `Section ${lineNumber}`;
        }

        currentSection = section;
        if (currentSection && !this.index[key].sections[currentSection]) {
          this.index[key].sections[currentSection] = { line_start: lineNumber, chunks: [] };
        }
      }

      buffer.push(line);
      if (buffer.length >= CHUNK_SIZE_LIMIT) {
        this.createChunk(key, buffer, currentSection, null, null);
        buffer = [];
      }
    }

    if (buffer.length > 0) {
      this.createChunk(key, buffer, currentSection, null, null);
    }
  }

  private scanDocumentationFiles(): void {
    const files = readdirSync(DOCS_PATH).filter((f: string) => f.endsWith(".md"));

    for (const filename of files) {
      const file = join(DOCS_PATH, filename);
      const sdkMatch = filename.match(/^([A-Z]+)_SDK\.md$/);
      if (sdkMatch) {
        const sdkName = sdkMatch[1].toLowerCase();
        this.sdkList.push(sdkName);
        this.index[sdkName] = {
          name: `${sdkMatch[1]} SDK`,
          file,
          sections: {},
          classes: {},
          chunks: [],
          source: null,
          generated: null,
        };
        this.parseDocumentationFile(file, sdkName);
      } else if (filename === "AUTHORING_OPENFGA_MODELS.md") {
        this.index.authoring = {
          name: "Model Authoring Guide",
          file,
          sections: {},
          classes: {},
          chunks: [],
          source: null,
          generated: null,
        };
        this.parseGeneralDocumentation(file, "authoring");
      } else if (filename === "OPENFGA_DOCS.md") {
        this.index.general = {
          name: "OpenFGA Documentation",
          file,
          sections: {},
          classes: {},
          chunks: [],
          source: null,
          generated: null,
        };
        this.parseGeneralDocumentation(file, "general");
      }
    }
  }
}

let instance: DocumentationIndex | null = null;

export function getDocumentationIndex(): DocumentationIndex {
  if (!instance) {
    instance = new DocumentationIndex();
  }
  return instance;
}

export function initializeDocumentationIndex(): DocumentationIndex {
  const index = getDocumentationIndex();
  index.initialize();
  return index;
}
