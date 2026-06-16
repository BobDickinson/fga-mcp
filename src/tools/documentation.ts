import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { findSimilarDocumentation, searchCodeExamples, searchDocumentation } from "../documentation/search.js";
import { withToolLogging } from "../tool-logging.js";

export function registerDocumentationTools(server: FastMCP): void {
  server.addTool({
    name: "find_similar_documentation",
    description: "Find documentation similar to provided content.",
    parameters: z.object({
      content: z.string().describe("Reference content to find similar documentation"),
      sdk: z.enum(["php", "go", "python", "java", "dotnet", "js", "laravel"]).optional(),
      similarity_threshold: z.number().min(0).max(1).default(0.5),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    execute: withToolLogging("find_similar_documentation", async ({ content, sdk, similarity_threshold, limit }) =>
      findSimilarDocumentation(content, sdk, similarity_threshold, limit),
    ),
  });

  server.addTool({
    name: "search_code_examples",
    description: "Search for code examples in documentation.",
    parameters: z.object({
      query: z.string(),
      language: z.enum(["php", "go", "python", "java", "csharp", "javascript", "typescript"]).optional(),
      include_context: z.boolean().default(true),
      limit: z.number().int().min(1).max(20).default(5),
      offset: z.number().int().min(0).default(0),
    }),
    execute: withToolLogging("search_code_examples", async ({ query, language, include_context, limit, offset }) =>
      searchCodeExamples(query, language, include_context, limit, offset),
    ),
  });

  server.addTool({
    name: "search_documentation",
    description: "Advanced documentation search with filtering and pagination.",
    parameters: z.object({
      query: z.string(),
      sdk: z.enum(["php", "go", "python", "java", "dotnet", "js", "laravel"]).optional(),
      search_type: z.enum(["content", "class", "method", "section"]).default("content"),
      limit: z.number().int().min(1).max(50).default(10),
      offset: z.number().int().min(0).default(0),
    }),
    execute: withToolLogging("search_documentation", async ({ query, sdk, search_type, limit, offset }) =>
      searchDocumentation(query, sdk, search_type, limit, offset),
    ),
  });
}
