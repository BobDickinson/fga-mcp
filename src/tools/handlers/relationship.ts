import {
  checkOfflineMode,
  checkRestrictedMode,
  checkWritePermission,
} from "../../guards.js";
import { requireClient, type ServerContext } from "../../client.js";
import { parseEntityString } from "../../dsl.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function checkPermission(
  ctx: ServerContext,
  store: string,
  model: string,
  user: string,
  relation: string,
  object: string,
): Promise<string> {
  const guards = [checkOfflineMode("Checking permissions"), checkRestrictedMode(store, model)];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).check(
      { user, relation, object },
      { storeId: store, authorizationModelId: model },
    );
    return response.allowed ? "✅ Permission allowed" : "❌ Permission denied";
  } catch (e) {
    return `❌ Failed to check permission! Error: ${errorMessage(e)}`;
  }
}

export async function grantPermission(
  ctx: ServerContext,
  store: string,
  model: string,
  user: string,
  relation: string,
  object: string,
): Promise<string> {
  const guards = [
    checkOfflineMode("Granting permissions"),
    checkWritePermission("grant permissions"),
    checkRestrictedMode(store, model),
  ];
  for (const g of guards) if (g) return g;

  try {
    await requireClient(ctx).writeTuples([{ user, relation, object }], { storeId: store, authorizationModelId: model });
    return "✅ Permission granted successfully";
  } catch (e) {
    return `❌ Failed to grant permission! Error: ${errorMessage(e)}`;
  }
}

export async function revokePermission(
  ctx: ServerContext,
  store: string,
  model: string,
  user: string,
  relation: string,
  object: string,
): Promise<string> {
  const guards = [
    checkOfflineMode("Revoking permissions"),
    checkWritePermission("revoke permissions"),
    checkRestrictedMode(store, model),
  ];
  for (const g of guards) if (g) return g;

  try {
    await requireClient(ctx).deleteTuples([{ user, relation, object }], { storeId: store, authorizationModelId: model });
    return "✅ Permission revoked successfully";
  } catch (e) {
    return `❌ Failed to revoke permission! Error: ${errorMessage(e)}`;
  }
}

export async function listObjects(
  ctx: ServerContext,
  store: string,
  model: string,
  type: string,
  user: string,
  relation: string,
): Promise<string | string[]> {
  const guards = [checkOfflineMode("Listing objects"), checkRestrictedMode(store, model)];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).listObjects(
      { user, relation, type },
      { storeId: store, authorizationModelId: model },
    );
    return response.objects ?? [];
  } catch (e) {
    return `❌ Failed to list objects! Error: ${errorMessage(e)}`;
  }
}

export async function listUsers(
  ctx: ServerContext,
  store: string,
  model: string,
  object: string,
  relation: string,
): Promise<string | string[]> {
  const guards = [checkOfflineMode("Listing users"), checkRestrictedMode(store, model)];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).listUsers(
      { object: parseEntityString(object), relation, user_filters: [{ type: "user" }] },
      { storeId: store, authorizationModelId: model },
    );
    return (response.users ?? [])
      .map((u) => {
        if (typeof u.object === "string") return u.object;
        if (u.object?.type && u.object?.id) return `${u.object.type}:${u.object.id}`;
        return "";
      })
      .filter(Boolean);
  } catch (e) {
    return `❌ Failed to list users! Error: ${errorMessage(e)}`;
  }
}
