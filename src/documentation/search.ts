import { getDocumentationIndex, type SearchChunkResult } from "./index.js";

const STOP_WORDS = new Set([
  "the", "is", "at", "which", "on", "and", "a", "an", "as", "are", "was", "were", "been", "be",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "must", "can", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
  "what", "which", "who", "when", "where", "why", "how", "all", "each", "every", "both", "few",
  "more", "most", "other", "some", "such", "only", "own", "same", "so", "than", "too", "very",
  "just", "in", "of", "to", "for", "with", "from", "up", "out", "if", "about", "into", "through",
  "during", "before", "after", "above", "below", "between", "under", "again", "further", "then", "once",
]);

const OPENFGA_TERMS = [
  "openfga", "authorization", "permission", "tuple", "relation", "check", "expand", "store", "model", "user", "object",
];

const VALID_SDKS = ["php", "go", "python", "java", "dotnet", "js", "laravel"] as const;
const VALID_LANGUAGES = ["php", "go", "python", "java", "csharp", "javascript", "typescript"] as const;

export function findSimilarDocumentation(
  content: string,
  sdk?: string,
  similarityThreshold = 0.5,
  limit = 5,
): string {
  if (!content.trim()) return "❌ Content cannot be empty";
  if (similarityThreshold < 0 || similarityThreshold > 1) return "❌ Similarity threshold must be between 0.0 and 1.0";
  if (limit < 1 || limit > 20) return "❌ Limit must be between 1 and 20";
  if (sdk && !VALID_SDKS.includes(sdk as (typeof VALID_SDKS)[number])) {
    return "❌ Invalid SDK. Must be one of: php, go, python, java, dotnet, js, laravel";
  }

  const index = getDocumentationIndex();
  const keyTerms = extractKeyTerms(content);
  if (keyTerms.length === 0) return "❌ Could not extract meaningful terms from the provided content";

  const similarChunks = new Map<string, SearchChunkResult & { similarity: number; content: string }>();

  for (const keyTerm of keyTerms) {
    const chunks = index.searchChunks(keyTerm, sdk ?? null, limit * 2);
    for (const chunk of chunks) {
      const chunkContent = index.getChunkById(chunk.chunk_id)?.content ?? "";
      const similarity = calculateSimilarity(content, chunkContent);
      if (similarity < similarityThreshold) continue;

      const key = `${chunk.sdk}::${chunk.chunk_id}`;
      const existing = similarChunks.get(key);
      if (!existing || existing.similarity < similarity) {
        similarChunks.set(key, { ...chunk, similarity, content: chunkContent });
      }
    }
  }

  const results = [...similarChunks.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  if (results.length === 0) {
    return `## Similar Documentation\n\nNo similar documentation found (threshold: ${similarityThreshold})${
      sdk ? ` in SDK: ${sdk}` : ""
    }\n\nTry:\n- Lowering the similarity threshold\n- Providing more specific content\n- Removing SDK filter for broader results`;
  }

  let markdown = "## Similar Documentation\n\n";
  markdown += `**Similarity Threshold:** ${similarityThreshold}\n`;
  if (sdk) markdown += `**SDK Filter:** ${sdk}\n`;
  markdown += `**Found:** ${results.length} similar document(s)\n\n---\n\n`;
  results.forEach((chunk, i) => {
    markdown += formatSimilarResult(chunk, i + 1);
  });
  return markdown;
}

export function searchCodeExamples(
  query: string,
  language?: string,
  includeContext = true,
  limit = 5,
  offset = 0,
): string {
  if (!query.trim()) return "❌ Search query cannot be empty";
  if (limit < 1 || limit > 20) return "❌ Limit must be between 1 and 20";
  if (offset < 0) return "❌ Offset cannot be negative";
  if (language && !VALID_LANGUAGES.includes(language as (typeof VALID_LANGUAGES)[number])) {
    return "❌ Invalid language. Must be one of: php, go, python, java, csharp, javascript, typescript";
  }

  const index = getDocumentationIndex();
  const sdk = mapLanguageToSdk(language);
  const allChunks = index.searchChunks(query, sdk);
  const codeExamples: Array<{ language: string; code: string; context: string; chunk: SearchChunkResult }> = [];

  for (const chunk of allChunks) {
    const chunkContent = index.getChunkById(chunk.chunk_id)?.content ?? "";
    for (const example of extractCodeFromChunk(chunkContent, language)) {
      codeExamples.push({ ...example, chunk });
    }
  }

  if (codeExamples.length === 0) {
    return `## Code Examples\n\nNo code examples found for: **${query}**${
      language ? ` (language: ${language})` : ""
    }\n\nTry:\n- Searching for specific method or class names\n- Using OpenFGA terminology (e.g., 'check', 'expand', 'tuples')\n- Removing language filter for broader results`;
  }

  const paginated = codeExamples.slice(offset, offset + limit);
  const totalPages = Math.ceil(codeExamples.length / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  let markdown = "## Code Examples\n\n";
  markdown += `**Search:** \`${query}\`\n`;
  if (language) markdown += `**Language:** ${language}\n`;
  markdown += `**Results:** Showing ${offset + 1}-${Math.min(offset + limit, codeExamples.length)} of ${codeExamples.length} examples\n\n---\n\n`;

  paginated.forEach((example, i) => {
    markdown += formatCodeExample(example, offset + i + 1, includeContext);
  });

  if (totalPages > 1) {
    markdown += "\n---\n\n### Pagination\n\n";
    if (currentPage > 1) markdown += `- **Previous page:** Use offset=${Math.max(0, offset - limit)}\n`;
    if (currentPage < totalPages) markdown += `- **Next page:** Use offset=${offset + limit}\n`;
  }

  return markdown;
}

export function searchDocumentation(
  query: string,
  sdk?: string,
  searchType = "content",
  limit = 10,
  offset = 0,
): string {
  if (!query.trim()) return "❌ Search query cannot be empty";
  if (limit < 1 || limit > 50) return "❌ Limit must be between 1 and 50";
  if (offset < 0) return "❌ Offset cannot be negative";
  if (!["content", "class", "method", "section"].includes(searchType)) {
    return "❌ Invalid search_type. Must be one of: content, class, method, section";
  }
  if (sdk && !VALID_SDKS.includes(sdk as (typeof VALID_SDKS)[number])) {
    return "❌ Invalid SDK. Must be one of: php, go, python, java, dotnet, js, laravel";
  }

  const index = getDocumentationIndex();
  const allResults = performSearch(index, query, sdk ?? null, searchType);
  const totalResults = allResults.length;

  if (totalResults === 0) {
    let markdown = "## Documentation Search Results\n\n";
    markdown += `**Query:** \`${query}\`\n`;
    if (sdk) markdown += `**SDK Filter:** ${sdk}\n`;
    markdown += `**Search Type:** ${searchType}\n\nNo results found for query: **${query}**`;
    if (sdk) markdown += ` (filtered by SDK: ${sdk})`;
    return markdown + "\n\nTry:\n- Using different keywords\n- Checking spelling\n- Using broader search terms";
  }

  const paginated = allResults.slice(offset, offset + limit);
  const totalPages = Math.ceil(totalResults / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  let markdown = "## Documentation Search Results\n\n";
  markdown += `**Query:** \`${query}\`\n`;
  if (sdk) markdown += `**SDK Filter:** ${sdk}\n`;
  markdown += `**Search Type:** ${searchType}\n`;
  markdown += `**Results:** Showing ${offset + 1}-${Math.min(offset + limit, totalResults)} of ${totalResults} total results\n`;
  markdown += `**Page:** ${currentPage} of ${totalPages}\n\n---\n\n`;

  paginated.forEach((result, i) => {
    markdown += formatSearchResult(result, offset + i + 1);
  });

  if (totalPages > 1) {
    markdown += "\n---\n\n### Pagination\n\n";
    if (currentPage > 1) markdown += `- **Previous page:** Use offset=${Math.max(0, offset - limit)}\n`;
    if (currentPage < totalPages) markdown += `- **Next page:** Use offset=${offset + limit}\n`;
  }

  return markdown;
}

function performSearch(
  index: ReturnType<typeof getDocumentationIndex>,
  query: string,
  sdk: string | null,
  searchType: string,
): SearchChunkResult[] {
  const allChunks = index.searchChunks(query, sdk, 100);
  if (searchType === "content") return allChunks;
  if (searchType === "class") {
    return allChunks.filter((c) => c.metadata.class && c.metadata.class.toLowerCase().includes(query.toLowerCase()));
  }
  if (searchType === "method") {
    return allChunks.filter((c) => c.metadata.method && c.metadata.method.toLowerCase().includes(query.toLowerCase()));
  }
  return allChunks.filter((c) => c.metadata.section && c.metadata.section.toLowerCase().includes(query.toLowerCase()));
}

function extractKeyTerms(content: string): string[] {
  const cleanContent = content.replace(/```[\s\S]*?```/g, "").replace(/[^a-zA-Z0-9\s]/g, " ");
  const words = cleanContent.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const termCounts = new Map<string, number>();
  for (const word of words) termCounts.set(word, (termCounts.get(word) ?? 0) + 1);
  const keyTerms = [...termCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([term]) => term);
  for (const term of OPENFGA_TERMS) {
    if (content.toLowerCase().includes(term) && !keyTerms.includes(term)) keyTerms.push(term);
  }
  return keyTerms.slice(0, 15);
}

function calculateSimilarity(content1: string, content2: string): number {
  if (!content1 || !content2) return 0;
  const terms1 = extractKeyTerms(content1);
  const terms2 = extractKeyTerms(content2);
  if (terms1.length === 0 || terms2.length === 0) return 0;

  const intersection = terms1.filter((t) => terms2.includes(t)).length;
  const union = new Set([...terms1, ...terms2]).size;
  let jaccard = intersection / union;

  const phrases = ["authorization model", "permission check", "tuple creation", "relationship tuples", "access control", "openfga"];
  for (const phrase of phrases) {
    if (content1.toLowerCase().includes(phrase) && content2.toLowerCase().includes(phrase)) jaccard += 0.1;
  }
  return Math.min(1, jaccard);
}

function extractCodeFromChunk(content: string, language?: string): Array<{ language: string; code: string; context: string }> {
  const pattern = /```(\w+)?\n([\s\S]*?)\n```/g;
  const examples: Array<{ language: string; code: string; context: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const codeLang = match[1] ?? "";
    const codeContent = match[2];
    if (language && !matchesLanguage(codeLang, codeContent, language)) continue;
    examples.push({
      language: codeLang || "unknown",
      code: codeContent,
      context: extractContext(content, match[0]),
    });
  }

  return examples;
}

function matchesLanguage(codeLang: string, codeContent: string, language: string): boolean {
  switch (language) {
    case "php":
      return codeLang === "php" || codeContent.includes("<?php");
    case "go":
      return codeLang === "go" || codeContent.includes("func ");
    case "python":
      return ["python", "py"].includes(codeLang) || codeContent.includes("def ");
    case "java":
      return codeLang === "java" || codeContent.includes("public class");
    case "csharp":
      return ["csharp", "cs"].includes(codeLang) || codeContent.includes("using ");
    case "javascript":
    case "typescript":
      return ["javascript", "js", "typescript", "ts"].includes(codeLang);
    default:
      return true;
  }
}

function extractContext(content: string, codeBlock: string): string {
  const position = content.indexOf(codeBlock);
  if (position === -1) return "";
  const beforeText = content.slice(Math.max(0, position - 200), position).replace(/\s+/g, " ").trim();
  const afterText = content.slice(position + codeBlock.length, position + codeBlock.length + 200).replace(/\s+/g, " ").trim();
  let context = "";
  if (beforeText) context += "..." + beforeText;
  context += " [CODE] ";
  if (afterText) context += afterText + "...";
  return context.trim();
}

function mapLanguageToSdk(language?: string): string | null {
  if (!language) return null;
  const mapping: Record<string, string> = {
    php: "php", go: "go", python: "python", java: "java", csharp: "dotnet", javascript: "js", typescript: "js",
  };
  return mapping[language] ?? null;
}

function formatCodeExample(
  example: { language: string; code: string; context: string; chunk: SearchChunkResult },
  number: number,
  includeContext: boolean,
): string {
  let markdown = `### Example ${number}\n\n`;
  if (example.chunk.sdk) markdown += `**SDK:** \`${example.chunk.sdk}\`  \n`;
  const meta = example.chunk.metadata;
  if (meta.class) {
    markdown += `**Class:** \`${meta.class}\``;
    if (meta.method) markdown += ` **Method:** \`${meta.method}\``;
    markdown += "  \n";
  }
  if (example.language && example.language !== "unknown") markdown += `**Language:** \`${example.language}\`  \n`;
  markdown += "\n";
  if (includeContext && example.context) {
    markdown += `**Context:**\n> ${example.context.replace("[CODE]", "*(see code below)*")}\n\n`;
  }
  markdown += `\`\`\`${example.language}\n${example.code}\n\`\`\`\n\n---\n\n`;
  return markdown;
}

function formatSearchResult(result: SearchChunkResult, number: number): string {
  let title = "Documentation Chunk";
  const meta = result.metadata;
  if (meta.class) {
    title = meta.class + (meta.method ? `::${meta.method}` : "");
  } else if (meta.section) {
    title = meta.section;
  }

  let markdown = `### ${number}. ${title}\n\n`;
  if (result.sdk) markdown += `**SDK:** \`${result.sdk}\`  \n`;
  if (result.score) markdown += `**Relevance:** ${Math.round(result.score * 100)}%  \n`;
  markdown += "\n";
  if (result.preview) {
    const preview = result.preview.length > 500 ? result.preview.slice(0, 497) + "..." : result.preview;
    markdown += `**Preview:**\n\`\`\`\n${preview}\n\`\`\`\n`;
  }
  markdown += `\n**Reference:** \`${result.sdk}::${result.chunk_id}\`\n\n---\n\n`;
  return markdown;
}

function formatSimilarResult(
  chunk: SearchChunkResult & { similarity: number; content: string },
  number: number,
): string {
  let title = "Related Documentation";
  const meta = chunk.metadata;
  if (meta.class) title = meta.class + (meta.method ? `::${meta.method}` : "");
  else if (meta.section) title = meta.section;

  let markdown = `### ${number}. ${title}\n\n`;
  if (chunk.sdk) markdown += `**SDK:** \`${chunk.sdk}\`  \n`;
  markdown += `**Similarity Score:** ${Math.round(chunk.similarity * 100)}%  \n\n`;
  const preview = chunk.content.length > 800 ? chunk.content.slice(0, 797) + "..." : chunk.content;
  markdown += `**Content:**\n\n${preview}\n`;
  markdown += `\n**Reference:** \`${chunk.sdk}::${chunk.chunk_id}\`\n\n---\n\n`;
  return markdown;
}
