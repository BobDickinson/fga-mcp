import { requireClient, type ServerContext } from "../../client.js";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatModelData(
  model: { id?: string; type_definitions?: Array<{ type?: string; relations?: Record<string, unknown> }> },
  storeId: string,
  isLatest = false,
) {
  const typeDefinitions = (model.type_definitions ?? []).map((td) => ({
    type: td.type,
    relations: Object.keys(td.relations ?? {}),
  }));
  return {
    id: model.id,
    schema_version: "1.1",
    created_at: null,
    type_definitions: typeDefinitions,
    type_count: typeDefinitions.length,
    ...(isLatest ? { store_id: storeId, is_latest: true } : {}),
  };
}

export function extractUsersFromTree(tree: unknown): string[] {
  const users = new Set<string>();
  const root =
    tree && typeof tree === "object" && "root" in (tree as Record<string, unknown>)
      ? (tree as { root: unknown }).root
      : tree;
  walkTree(root, users);
  return [...users];
}

function addUserFromEntry(entry: { object?: { id?: string; type?: string } | string }, users: Set<string>): void {
  if (typeof entry.object === "string") {
    users.add(entry.object);
  } else if (entry.object?.type && entry.object?.id) {
    users.add(`${entry.object.type}:${entry.object.id}`);
  }
}

function walkTree(node: unknown, users: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  const leaf = n.leaf as Record<string, unknown> | undefined;
  if (leaf?.users) {
    const usersField = leaf.users;
    if (Array.isArray(usersField)) {
      for (const entry of usersField) {
        if (typeof entry === "string") users.add(entry);
        else addUserFromEntry(entry as { object?: { id?: string; type?: string } | string }, users);
      }
    } else {
      const userList = usersField as { users?: Array<string | { object?: { id?: string; type?: string } | string }> };
      for (const entry of userList.users ?? []) {
        if (typeof entry === "string") users.add(entry);
        else addUserFromEntry(entry, users);
      }
    }
  }
  if (n.union) for (const child of n.union as unknown[]) walkTree(child, users);
  if (n.intersection) for (const child of n.intersection as unknown[]) walkTree(child, users);
  if (n.difference) walkTree(n.difference, users);
  if (n.computed) walkTree(n.computed, users);
}

export async function readAllTupleField(ctx: ServerContext, storeId: string, field: "user" | "object"): Promise<string[]> {
  const values = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const response = await requireClient(ctx).read({}, { storeId, pageSize: 100, continuationToken });
    for (const tuple of response.tuples ?? []) {
      const value = tuple.key?.[field];
      if (value) values.add(value);
    }
    continuationToken = response.continuation_token;
  } while (continuationToken);
  return [...values];
}

export async function readAllRelationships(ctx: ServerContext, storeId: string) {
  const relationships: Array<{ user: string; relation: string; object: string }> = [];
  let continuationToken: string | undefined;
  do {
    const response = await requireClient(ctx).read({}, { storeId, pageSize: 100, continuationToken });
    for (const tuple of response.tuples ?? []) {
      if (tuple.key?.user && tuple.key.relation && tuple.key.object) {
        relationships.push({ user: tuple.key.user, relation: tuple.key.relation, object: tuple.key.object });
      }
    }
    continuationToken = response.continuation_token;
  } while (continuationToken);
  return relationships;
}
