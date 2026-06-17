import type { FastMCP } from "fastmcp";
import {
  completeChunkIds,
  completeClassNames,
  completeMethodNames,
  completeSectionNames,
  completeSdks,
} from "../completions/index.js";
import * as documentationHandlers from "./handlers/documentation.js";
import { registerStoreResources, registerModelResources, registerRelationshipResources } from "./admin.js";

function jsonResource(data: unknown) {
  return { text: JSON.stringify(data, null, 2) };
}

function markdownFromHandler(result: Record<string, unknown>) {
  if (typeof result.content === "string" && String(result.status ?? "").includes("✅")) {
    return { text: result.content };
  }
  return { text: JSON.stringify(result) };
}

export { registerStoreResources, registerModelResources, registerRelationshipResources };

export function registerDocumentationResources(server: FastMCP): void {
  server.addResource({
    uri: "openfga://docs",
    name: "get_documentation_index",
    description: "Returns an index of all available OpenFGA documentation",
    mimeType: "application/json",
    load: async () => jsonResource(documentationHandlers.listDocumentation()),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://docs/{sdk}",
    name: "get_documentation_overview",
    description: "Get overview and sections for a specific SDK or general documentation",
    mimeType: "application/json",
    arguments: [{ name: "sdk", required: true, complete: async (value: string) => ({ values: completeSdks(value) }) }],
    load: async ({ sdk }) => jsonResource(documentationHandlers.getSdkDocumentation(sdk!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://docs/{sdk}/class/{className}",
    name: "get_class_documentation",
    mimeType: "text/markdown",
    arguments: [
      { name: "sdk", required: true, complete: async (value: string) => ({ values: completeSdks(value) }) },
      { name: "className", required: true, complete: async (value: string) => ({ values: completeClassNames("", value) }) },
    ],
    load: async ({ sdk, className }) => markdownFromHandler(documentationHandlers.getClassDocumentation(sdk!, className!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://docs/{sdk}/method/{className}/{methodName}",
    name: "get_sdk_method_documentation",
    mimeType: "text/markdown",
    arguments: [
      { name: "sdk", required: true, complete: async (value: string) => ({ values: completeSdks(value) }) },
      { name: "className", required: true, complete: async (value: string) => ({ values: completeClassNames("", value) }) },
      { name: "methodName", required: true, complete: async (value: string) => ({ values: completeMethodNames("", "", value) }) },
    ],
    load: async ({ sdk, className, methodName }) =>
      markdownFromHandler(documentationHandlers.getMethodDocumentation(sdk!, className!, methodName!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://docs/{sdk}/section/{sectionName}",
    name: "get_documentation_section",
    mimeType: "text/markdown",
    arguments: [
      { name: "sdk", required: true, complete: async (value: string) => ({ values: completeSdks(value) }) },
      { name: "sectionName", required: true, complete: async (value: string) => ({ values: completeSectionNames("", value) }) },
    ],
    load: async ({ sdk, sectionName }) => markdownFromHandler(documentationHandlers.getDocumentationSection(sdk!, sectionName!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://docs/{sdk}/chunk/{chunkId}",
    name: "get_documentation_chunk",
    mimeType: "text/markdown",
    arguments: [
      { name: "sdk", required: true, complete: async (value: string) => ({ values: completeSdks(value) }) },
      { name: "chunkId", required: true, complete: async (value: string) => ({ values: completeChunkIds("", value) }) },
    ],
    load: async ({ sdk, chunkId }) => markdownFromHandler(documentationHandlers.getDocumentationChunk(sdk!, chunkId!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://docs/search/{query}",
    name: "search_documentation",
    description: "Search across all OpenFGA documentation content",
    mimeType: "application/json",
    arguments: [{ name: "query", required: true }],
    load: async ({ query }) => jsonResource(documentationHandlers.searchDocumentation(query!)),
  });
}
