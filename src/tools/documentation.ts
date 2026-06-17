import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { findSimilarDocumentation, searchCodeExamples, searchDocumentation } from "../documentation/search.js";
import { withToolLogging } from "../tool-logging.js";

export function registerDocumentationTools(server: FastMCP): void {
  server.addTool({
    name: "find_similar_documentation",
    description: "Find OpenFGA SDK documentation chunks similar to provided content. Works offline; no FGA server required.",
    parameters: z.object({
      content: z.string().describe("Reference text to find similar documentation for."),
      sdk: z
        .enum(["php", "go", "python", "java", "dotnet", "js", "laravel"])
        .optional()
        .describe("Limit search to one SDK; omit to search all SDKs."),
      similarity_threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.5)
        .describe("Minimum similarity score from 0 to 1."),
      limit: z.number().int().min(1).max(20).default(5).describe("Maximum number of results to return."),
    }),
    execute: withToolLogging("find_similar_documentation", async ({ content, sdk, similarity_threshold, limit }) =>
      findSimilarDocumentation(content, sdk, similarity_threshold, limit),
    ),
  });

  server.addTool({
    name: "search_code_examples",
    description: "Search for code examples in OpenFGA SDK documentation. Works offline; no FGA server required.",
    parameters: z.object({
      query: z.string().describe("Search terms for code examples."),
      language: z
        .enum(["php", "go", "python", "java", "csharp", "javascript", "typescript"])
        .optional()
        .describe("Filter examples by programming language."),
      include_context: z
        .boolean()
        .default(true)
        .describe("Include surrounding documentation context with each example."),
      limit: z.number().int().min(1).max(20).default(5).describe("Maximum number of results to return."),
      offset: z.number().int().min(0).default(0).describe("Result offset for pagination."),
    }),
    execute: withToolLogging("search_code_examples", async ({ query, language, include_context, limit, offset }) =>
      searchCodeExamples(query, language, include_context, limit, offset),
    ),
  });

  server.addTool({
    name: "search_documentation",
    description: "Search OpenFGA SDK and authoring documentation with filtering and pagination. Works offline; no FGA server required.",
    parameters: z.object({
      query: z.string().describe("Search terms."),
      sdk: z
        .enum(["php", "go", "python", "java", "dotnet", "js", "laravel"])
        .optional()
        .describe("Limit search to one SDK; omit to search all."),
      search_type: z
        .enum(["content", "class", "method", "section"])
        .default("content")
        .describe("Kind of documentation entry to search."),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results to return."),
      offset: z.number().int().min(0).default(0).describe("Result offset for pagination."),
    }),
    execute: withToolLogging("search_documentation", async ({ query, sdk, search_type, limit, offset }) =>
      searchDocumentation(query, sdk, search_type, limit, offset),
    ),
  });
}
