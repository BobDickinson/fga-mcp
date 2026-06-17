import type { FastMCP } from "fastmcp";
import type { ServerContext } from "../client.js";
import type { CompletionScope } from "../resource-resolver.js";
import {
  getResourceRegistrationPlan,
  isResourceTarget,
  normalizeResourceTarget,
  resolveResourceTarget,
} from "../resource-resolver.js";
import {
  COMMON_OBJECT_PATTERNS,
  COMMON_USER_PATTERNS,
  completeFromTuples,
  completeModelIds,
  completeRelations,
  completeServerNames,
  completeStoreIds,
} from "../completions/index.js";
import * as storeHandlers from "./handlers/store.js";
import * as modelHandlers from "./handlers/model.js";
import * as relationshipHandlers from "./handlers/relationship.js";

function jsonResource(data: unknown) {
  return { text: JSON.stringify(data, null, 2) };
}

type UriFamily = {
  storesUri: string;
  storeBaseUri: string;
  dynamicOnly: boolean;
  nameSuffix: string;
  includeServer: boolean;
  includeScope: boolean;
};

type TemplateArg = {
  name: string;
  required: boolean;
  complete?: (value: string) => Promise<{ values: string[] }>;
};

function scopeFromFamily(_family: UriFamily): CompletionScope {
  return {};
}

async function resolveLoadedTarget(
  ctx: ServerContext,
  params: Record<string, string | undefined>,
  family: UriFamily,
  requireStore = false,
) {
  const normalized = normalizeResourceTarget(params);
  normalized.dynamicOnly = family.dynamicOnly;
  const target = resolveResourceTarget(ctx, normalized);
  if (!isResourceTarget(target)) return jsonResource(target);
  if (requireStore && !params.storeId) return jsonResource({ error: "❌ storeId is required." });
  return target;
}

function routingArgs(ctx: ServerContext, family: UriFamily): TemplateArg[] {
  const args: TemplateArg[] = [];
  if (family.includeScope) {
    args.push({ name: "connectionScope", required: ctx.transport === "http" });
  }
  if (family.includeServer) {
    args.push({
      name: "server",
      required: true,
      complete: async (value) => ({
        values: await completeServerNames(ctx, value, {}),
      }),
    });
  }
  return args;
}

function storeIdArg(ctx: ServerContext, family: UriFamily): TemplateArg {
  const scope = scopeFromFamily(family);
  return {
    name: "storeId",
    required: true,
    complete: async (value) => ({
      values: await completeStoreIds(ctx, value, scope),
    }),
  };
}

function registerAdminFamily(server: FastMCP, ctx: ServerContext, family: UriFamily): void {
  const routeArgs = routingArgs(ctx, family);

  const listStoresLoad = async (params: Record<string, string | undefined>) => {
    const loaded = await resolveLoadedTarget(ctx, params, family);
    if (!isResourceTarget(loaded)) return loaded;
    return jsonResource(await storeHandlers.listStores(loaded));
  };

  if (family.includeServer || family.includeScope) {
    server.addResourceTemplate({
      uriTemplate: family.storesUri,
      name: `list_stores${family.nameSuffix}`,
      description: family.dynamicOnly
        ? "List OpenFGA stores on a dynamic server in a connection scope"
        : "List OpenFGA stores on a FGA server",
      mimeType: "application/json",
      arguments: routeArgs,
      load: listStoresLoad,
    });
  } else {
    server.addResource({
      uri: family.storesUri,
      name: `list_stores${family.nameSuffix}`,
      description: "List all available OpenFGA stores",
      mimeType: "application/json",
      load: async () => listStoresLoad({}),
    });
  }

  const withStoreArgs = [...routeArgs, storeIdArg(ctx, family)];

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}`,
    name: `get_store${family.nameSuffix}`,
    description: "Get detailed information about a specific OpenFGA store",
    mimeType: "application/json",
    arguments: withStoreArgs,
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(await storeHandlers.getStore(loaded, params.storeId!));
    },
  });

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}/models`,
    name: `list_models${family.nameSuffix}`,
    description: "List all authorization models in a specific OpenFGA store",
    mimeType: "application/json",
    arguments: withStoreArgs,
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(await storeHandlers.listStoreModels(loaded, params.storeId!));
    },
  });

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}/model/latest`,
    name: `get_latest_model${family.nameSuffix}`,
    description: "Get the latest authorization model in a store",
    mimeType: "application/json",
    arguments: withStoreArgs,
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(await modelHandlers.getLatestModel(loaded, params.storeId!));
    },
  });

  const withModelArgs: TemplateArg[] = [
    ...withStoreArgs,
    {
      name: "modelId",
      required: true,
      complete: async (value) => ({
        values: await completeModelIds(ctx, "", value, scopeFromFamily(family)),
      }),
    },
  ];

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}/model/{modelId}`,
    name: `get_model${family.nameSuffix}`,
    description: "Get detailed information about a specific authorization model",
    mimeType: "application/json",
    arguments: withModelArgs,
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(await modelHandlers.getModel(loaded, params.storeId!, params.modelId!));
    },
  });

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}/check?user={user}&relation={relation}&object={object}&model={modelId}`,
    name: `check_permission${family.nameSuffix}`,
    description: "Check if a user has a specific permission on an object",
    mimeType: "application/json",
    arguments: [
      ...withStoreArgs,
      {
        name: "user",
        required: true,
        complete: async (value) => ({
          values: await completeFromTuples(ctx, "", "user", value, COMMON_USER_PATTERNS, scopeFromFamily(family)),
        }),
      },
      {
        name: "relation",
        required: true,
        complete: async (value) => ({
          values: await completeRelations(ctx, "", value, scopeFromFamily(family)),
        }),
      },
      {
        name: "object",
        required: true,
        complete: async (value) => ({
          values: await completeFromTuples(ctx, "", "object", value, COMMON_OBJECT_PATTERNS, scopeFromFamily(family)),
        }),
      },
      {
        name: "modelId",
        required: true,
        complete: async (value) => ({
          values: await completeModelIds(ctx, "", value, scopeFromFamily(family)),
        }),
      },
    ],
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(
        await relationshipHandlers.checkPermission(
          loaded,
          params.storeId!,
          params.user!,
          params.relation!,
          params.object!,
          params.modelId ?? "",
        ),
      );
    },
  });

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}/expand?object={object}&relation={relation}`,
    name: `expand_relationship${family.nameSuffix}`,
    description: "Expand all users who have a specific relation to an object",
    mimeType: "application/json",
    arguments: [
      ...withStoreArgs,
      {
        name: "object",
        required: true,
        complete: async (value) => ({
          values: await completeFromTuples(ctx, "", "object", value, COMMON_OBJECT_PATTERNS, scopeFromFamily(family)),
        }),
      },
      {
        name: "relation",
        required: true,
        complete: async (value) => ({
          values: await completeRelations(ctx, "", value, scopeFromFamily(family)),
        }),
      },
    ],
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(
        await relationshipHandlers.expandRelationships(loaded, params.storeId!, params.object!, params.relation!),
      );
    },
  });

  for (const [name, pathSuffix, handler] of [
    ["list_objects", "objects", relationshipHandlers.listObjects] as const,
    ["list_users", "users", relationshipHandlers.listUsers] as const,
  ]) {
    server.addResourceTemplate({
      uriTemplate: `${family.storeBaseUri}/${pathSuffix}`,
      name: `${name}${family.nameSuffix}`,
      description: name === "list_objects" ? "List all objects in a store" : "List all users in a store",
      mimeType: "application/json",
      arguments: withStoreArgs,
      load: async (params) => {
        const loaded = await resolveLoadedTarget(ctx, params, family, true);
        if (!isResourceTarget(loaded)) return loaded;
        return jsonResource(await handler(loaded, params.storeId!));
      },
    });
  }

  server.addResourceTemplate({
    uriTemplate: `${family.storeBaseUri}/relationships`,
    name: `list_relationships${family.nameSuffix}`,
    description: "List all relationships (tuples) in a specific OpenFGA store",
    mimeType: "application/json",
    arguments: withStoreArgs,
    load: async (params) => {
      const loaded = await resolveLoadedTarget(ctx, params, family, true);
      if (!isResourceTarget(loaded)) return loaded;
      return jsonResource(await relationshipHandlers.listRelationships(loaded, params.storeId!));
    },
  });
}

export function registerAdminResources(server: FastMCP, ctx: ServerContext): void {
  const plan = getResourceRegistrationPlan(ctx);
  const hasDynamicCoexistence = plan.dynamicScopePrefixed && (plan.legacyFixed || plan.fixedServerPrefixed);

  if (plan.legacyFixed) {
    registerAdminFamily(server, ctx, {
      storesUri: "openfga://stores",
      storeBaseUri: "openfga://store/{storeId}",
      dynamicOnly: false,
      nameSuffix: "",
      includeServer: false,
      includeScope: false,
    });
  }

  if (plan.fixedServerPrefixed) {
    registerAdminFamily(server, ctx, {
      storesUri: "openfga://server/{server}/stores",
      storeBaseUri: "openfga://server/{server}/store/{storeId}",
      dynamicOnly: false,
      nameSuffix: "",
      includeServer: true,
      includeScope: false,
    });
  }

  if (plan.dynamicScopePrefixed) {
    registerAdminFamily(server, ctx, {
      storesUri: "openfga://scope/{connectionScope}/server/{server}/stores",
      storeBaseUri: "openfga://scope/{connectionScope}/server/{server}/store/{storeId}",
      dynamicOnly: true,
      nameSuffix: hasDynamicCoexistence ? "_scoped" : "",
      includeServer: true,
      includeScope: true,
    });
  }
}

export function registerStoreResources(server: FastMCP, ctx: ServerContext): void {
  registerAdminResources(server, ctx);
}

export function registerModelResources(_server: FastMCP, _ctx: ServerContext): void {}

export function registerRelationshipResources(_server: FastMCP, _ctx: ServerContext): void {}
