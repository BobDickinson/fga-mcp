import type { FastMCP } from "fastmcp";
import {
  COMMON_OBJECT_PATTERNS,
  COMMON_USER_PATTERNS,
  completeChunkIds,
  completeClassNames,
  completeFromTuples,
  completeMethodNames,
  completeModelIds,
  completeRelations,
  completeSectionNames,
  completeSdks,
  completeStoreIds,
} from "../completions/index.js";
import { getConfiguredString } from "../config.js";
import type { ServerContext } from "../client.js";
import * as storeHandlers from "./handlers/store.js";
import * as modelHandlers from "./handlers/model.js";
import * as relationshipHandlers from "./handlers/relationship.js";
import * as documentationHandlers from "./handlers/documentation.js";

function jsonResource(data: unknown) {
  return { text: JSON.stringify(data, null, 2) };
}

function markdownFromHandler(result: Record<string, unknown>) {
  if (typeof result.content === "string" && String(result.status ?? "").includes("✅")) {
    return { text: result.content };
  }
  return { text: JSON.stringify(result) };
}

function configuredStoreId(): string {
  return getConfiguredString("OPENFGA_MCP_API_STORE", "");
}

export function registerStoreResources(server: FastMCP, ctx: ServerContext): void {
  server.addResource({
    uri: "openfga://stores",
    name: "list_stores",
    description: "List all available OpenFGA stores",
    mimeType: "application/json",
    load: async () => jsonResource(await storeHandlers.listStores(ctx)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}",
    name: "get_store",
    description: "Get detailed information about a specific OpenFGA store",
    mimeType: "application/json",
    arguments: [{ name: "storeId", description: "Store ID", required: true, complete: async (value) => ({ values: await completeStoreIds(ctx, value) }) }],
    load: async ({ storeId }) => jsonResource(await storeHandlers.getStore(ctx, storeId!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}/models",
    name: "list_models",
    description: "List all authorization models in a specific OpenFGA store",
    mimeType: "application/json",
    arguments: [{ name: "storeId", required: true, complete: async (value) => ({ values: await completeStoreIds(ctx, value) }) }],
    load: async ({ storeId }) => jsonResource(await storeHandlers.listStoreModels(ctx, storeId!)),
  });
}

export function registerModelResources(server: FastMCP, ctx: ServerContext): void {
  const storeArg = { name: "storeId", required: true, complete: async (value: string) => ({ values: await completeStoreIds(ctx, value) }) };
  const modelArg = {
    name: "modelId",
    required: true,
    complete: async (value: string) => ({ values: await completeModelIds(ctx, configuredStoreId(), value) }),
  };

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}/model/latest",
    name: "get_latest_model",
    description: "Get the latest authorization model in a store",
    mimeType: "application/json",
    arguments: [storeArg],
    load: async ({ storeId }) => jsonResource(await modelHandlers.getLatestModel(ctx, storeId!)),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}/model/{modelId}",
    name: "get_model",
    description: "Get detailed information about a specific authorization model",
    mimeType: "application/json",
    arguments: [storeArg, modelArg],
    load: async ({ storeId, modelId }) => jsonResource(await modelHandlers.getModel(ctx, storeId!, modelId!)),
  });
}

export function registerRelationshipResources(server: FastMCP, ctx: ServerContext): void {
  const storeArg = { name: "storeId", required: true, complete: async (value: string) => ({ values: await completeStoreIds(ctx, value) }) };

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}/check?user={user}&relation={relation}&object={object}&model={modelId}",
    name: "check_permission",
    description: "Check if a user has a specific permission on an object",
    mimeType: "application/json",
    arguments: [
      storeArg,
      { name: "user", required: true, complete: async (value: string) => ({ values: await completeFromTuples(ctx, configuredStoreId(), "user", value, COMMON_USER_PATTERNS) }) },
      { name: "relation", required: true, complete: async (value: string) => ({ values: await completeRelations(ctx, configuredStoreId(), value) }) },
      { name: "object", required: true, complete: async (value: string) => ({ values: await completeFromTuples(ctx, configuredStoreId(), "object", value, COMMON_OBJECT_PATTERNS) }) },
      { name: "modelId", required: true, complete: async (value: string) => ({ values: await completeModelIds(ctx, configuredStoreId(), value) }) },
    ],
    load: async ({ storeId, user, relation, object, modelId }) =>
      jsonResource(await relationshipHandlers.checkPermission(ctx, storeId!, user!, relation!, object!, modelId ?? "")),
  });

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}/expand?object={object}&relation={relation}",
    name: "expand_relationship",
    description: "Expand all users who have a specific relation to an object",
    mimeType: "application/json",
    arguments: [
      storeArg,
      { name: "object", required: true, complete: async (value: string) => ({ values: await completeFromTuples(ctx, configuredStoreId(), "object", value, COMMON_OBJECT_PATTERNS) }) },
      { name: "relation", required: true, complete: async (value: string) => ({ values: await completeRelations(ctx, configuredStoreId(), value) }) },
    ],
    load: async ({ storeId, object, relation }) =>
      jsonResource(await relationshipHandlers.expandRelationships(ctx, storeId!, object!, relation!)),
  });

  for (const [name, uriSuffix, handler] of [
    ["list_objects", "objects", relationshipHandlers.listObjects] as const,
    ["list_users", "users", relationshipHandlers.listUsers] as const,
  ]) {
    server.addResourceTemplate({
      uriTemplate: `openfga://store/{storeId}/${uriSuffix}`,
      name,
      description: name === "list_objects" ? "List all objects in a specific OpenFGA store" : "List all users in a specific OpenFGA store",
      mimeType: "application/json",
      arguments: [storeArg],
      load: async ({ storeId }) => jsonResource(await handler(ctx, storeId!)),
    });
  }

  server.addResourceTemplate({
    uriTemplate: "openfga://store/{storeId}/relationships",
    name: "list_relationships",
    description: "List all relationships (tuples) in a specific OpenFGA store",
    mimeType: "application/json",
    arguments: [storeArg],
    load: async ({ storeId }) => jsonResource(await relationshipHandlers.listRelationships(ctx, storeId!)),
  });
}

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
