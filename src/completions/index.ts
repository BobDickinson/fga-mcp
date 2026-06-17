import { isOfflineMode } from "../config.js";
import { getDocumentationIndex } from "../documentation/index.js";
import type { ServerContext } from "../client.js";
import { requirePool } from "../client.js";
import type { CompletionScope } from "../resource-resolver.js";
import { resolveCompletionClient, resolveCompletionPolicy } from "../resource-resolver.js";

export type { CompletionScope };

export function filterCompletions(completions: string[], currentValue: string): string[] {
  if (!currentValue) return completions;
  const lower = currentValue.toLowerCase();
  return completions.filter((c) => c.toLowerCase().startsWith(lower));
}

export async function completeServerNames(
  ctx: ServerContext,
  value: string,
  scope: Pick<CompletionScope, "connectionScope"> = {},
): Promise<string[]> {
  if (isOfflineMode()) return [];

  if (scope.connectionScope && ctx.dynamicStore) {
    try {
      const servers = ctx.dynamicStore.listServers(scope.connectionScope).map((s) => s.name);
      return filterCompletions(servers, value);
    } catch {
      return [];
    }
  }

  try {
    const pool = requirePool(ctx);
    return filterCompletions([...pool.servers.keys()], value);
  } catch {
    return [];
  }
}

export async function completeStoreIds(
  ctx: ServerContext,
  value: string,
  scope: CompletionScope = {},
): Promise<string[]> {
  const client = resolveCompletionClient(ctx, scope);
  if (isOfflineMode() || !client) return [];
  try {
    const response = await client.listStores();
    const ids = (response.stores ?? []).map((s) => s.id).filter(Boolean) as string[];
    return filterCompletions(ids, value);
  } catch {
    return [];
  }
}

export async function completeModelIds(
  ctx: ServerContext,
  storeId: string,
  value: string,
  scope: CompletionScope = {},
): Promise<string[]> {
  const client = resolveCompletionClient(ctx, scope);
  const policy = resolveCompletionPolicy(ctx, scope);
  if (isOfflineMode() || !client || !storeId) return filterCompletions(["latest"], value);
  if (policy?.restrict) return [];
  try {
    const response = await client.readAuthorizationModels({ storeId });
    const ids = (response.authorization_models ?? []).map((m) => m.id).filter(Boolean) as string[];
    ids.unshift("latest");
    return filterCompletions([...new Set(ids)], value);
  } catch {
    return filterCompletions(["latest"], value);
  }
}

export async function completeRelations(
  ctx: ServerContext,
  storeId: string,
  value: string,
  scope: CompletionScope = {},
): Promise<string[]> {
  const common = ["viewer", "reader", "editor", "writer", "owner", "member", "admin"];
  const client = resolveCompletionClient(ctx, scope);
  if (isOfflineMode() || !client || !storeId) return filterCompletions(common, value);
  try {
    const response = await client.readAuthorizationModel({ storeId, authorizationModelId: "latest" });
    const relations = new Set<string>();
    for (const typeDef of response.authorization_model?.type_definitions ?? []) {
      for (const relation of Object.keys(typeDef.relations ?? {})) relations.add(relation);
    }
    if (relations.size === 0) return filterCompletions(common, value);
    return filterCompletions([...relations].sort(), value);
  } catch {
    return filterCompletions(common, value);
  }
}

export async function completeFromTuples(
  ctx: ServerContext,
  storeId: string,
  field: "user" | "object",
  value: string,
  fallback: string[],
  scope: CompletionScope = {},
): Promise<string[]> {
  const client = resolveCompletionClient(ctx, scope);
  const policy = resolveCompletionPolicy(ctx, scope);
  if (isOfflineMode() || !client || !storeId) return filterCompletions(fallback, value);
  if (policy?.restrict) return [];
  try {
    const response = await client.read({}, { storeId, pageSize: 50 });
    const values = new Set<string>();
    for (const tuple of response.tuples ?? []) {
      const key = tuple.key?.[field];
      if (key) values.add(key);
    }
    if (values.size === 0) return filterCompletions(fallback, value);
    return filterCompletions([...values].sort().slice(0, 50), value);
  } catch {
    return filterCompletions(fallback, value);
  }
}

export function completeSdks(value: string): string[] {
  const index = getDocumentationIndex();
  index.initialize();
  const sdks = [...index.getSdkList(), "general", "authoring"];
  return filterCompletions(sdks, value);
}

export function completeClassNames(sdk: string, value: string): string[] {
  getDocumentationIndex().initialize();
  if (sdk) {
    return filterCompletions(getDocumentationIndex().getSdkOverview(sdk)?.classes ?? [], value);
  }
  const all = new Set<string>();
  for (const s of getDocumentationIndex().getSdkList()) {
    for (const c of getDocumentationIndex().getSdkOverview(s)?.classes ?? []) all.add(c);
  }
  return filterCompletions([...all].sort(), value);
}

export function completeSectionNames(sdk: string, value: string): string[] {
  getDocumentationIndex().initialize();
  if (sdk) {
    return filterCompletions(getDocumentationIndex().getSdkOverview(sdk)?.sections ?? [], value);
  }
  const all = new Set<string>();
  for (const s of getDocumentationIndex().getSdkList()) {
    for (const section of getDocumentationIndex().getSdkOverview(s)?.sections ?? []) all.add(section);
  }
  return filterCompletions([...all].sort(), value);
}

export function completeMethodNames(sdk: string, className: string, value: string): string[] {
  getDocumentationIndex().initialize();
  if (sdk && className) {
    const classDoc = getDocumentationIndex().getClassDocumentation(sdk, className);
    return filterCompletions(classDoc ? Object.keys(classDoc.methods) : [], value);
  }
  const all = new Set<string>();
  const sdks = sdk ? [sdk] : getDocumentationIndex().getSdkList();
  for (const s of sdks) {
    const classes = className ? [className] : (getDocumentationIndex().getSdkOverview(s)?.classes ?? []);
    for (const cls of classes) {
      const classDoc = getDocumentationIndex().getClassDocumentation(s, cls);
      if (classDoc) for (const method of Object.keys(classDoc.methods)) all.add(method);
    }
  }
  return filterCompletions([...all].sort(), value);
}

export function completeChunkIds(sdk: string, value: string): string[] {
  getDocumentationIndex().initialize();
  if (sdk) {
    return filterCompletions(
      getDocumentationIndex().searchChunks("", sdk, 100).map((c) => c.chunk_id),
      value,
    );
  }
  const all = new Set<string>();
  for (const s of getDocumentationIndex().getSdkList()) {
    for (const chunk of getDocumentationIndex().searchChunks("", s, 50)) all.add(chunk.chunk_id);
  }
  return filterCompletions([...all].sort(), value);
}

export const COMMON_USER_PATTERNS = [
  "user:alice", "user:bob", "user:admin", "user:guest",
  "group:admins", "group:users", "group:viewers", "service:api", "service:backend",
];

export const COMMON_OBJECT_PATTERNS = [
  "document:", "folder:", "project:", "organization:", "team:", "repo:",
];
