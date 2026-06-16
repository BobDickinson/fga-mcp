import { resolveAdminTarget, resolveTupleTarget } from "../../admin-context.js";
import { checkOfflineMode, checkRestrictedMode, checkWritePermission } from "../../guards.js";
import type { ServerContext } from "../../client.js";
import { parseEntityString } from "../../dsl.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function checkPermission(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  user: string,
  relation: string,
  object: string,
  server?: string,
): Promise<string> {
  const offline = checkOfflineMode(ctx, "Checking permissions");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { server, store, model });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, resolved.store, resolved.model);
  if (restrict) return restrict;

  try {
    const response = await resolved.client.check(
      { user, relation, object },
      { storeId: resolved.store!, authorizationModelId: resolved.model! },
    );
    return response.allowed ? "✅ Permission allowed" : "❌ Permission denied";
  } catch (e) {
    return `❌ Failed to check permission! Error: ${errorMessage(e)}`;
  }
}

export async function grantPermission(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  user: string,
  relation: string,
  object: string,
  server?: string,
): Promise<string> {
  const offline = checkOfflineMode(ctx, "Granting permissions");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { server, store, model });
  if (typeof resolved === "string") return resolved;

  const guards = [
    checkWritePermission(resolved.policy, "grant permissions"),
    checkRestrictedMode(resolved.policy, resolved.store, resolved.model),
  ];
  for (const g of guards) if (g) return g;

  try {
    await resolved.client.writeTuples([{ user, relation, object }], {
      storeId: resolved.store!,
      authorizationModelId: resolved.model!,
    });
    return "✅ Permission granted successfully";
  } catch (e) {
    return `❌ Failed to grant permission! Error: ${errorMessage(e)}`;
  }
}

export async function revokePermission(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  user: string,
  relation: string,
  object: string,
  server?: string,
): Promise<string> {
  const offline = checkOfflineMode(ctx, "Revoking permissions");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { server, store, model });
  if (typeof resolved === "string") return resolved;

  const guards = [
    checkWritePermission(resolved.policy, "revoke permissions"),
    checkRestrictedMode(resolved.policy, resolved.store, resolved.model),
  ];
  for (const g of guards) if (g) return g;

  try {
    await resolved.client.deleteTuples([{ user, relation, object }], {
      storeId: resolved.store!,
      authorizationModelId: resolved.model!,
    });
    return "✅ Permission revoked successfully";
  } catch (e) {
    return `❌ Failed to revoke permission! Error: ${errorMessage(e)}`;
  }
}

export async function listObjects(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  type: string,
  user: string,
  relation: string,
  server?: string,
): Promise<string | string[]> {
  const offline = checkOfflineMode(ctx, "Listing objects");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { server, store, model });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, resolved.store, resolved.model);
  if (restrict) return restrict;

  try {
    const response = await resolved.client.listObjects(
      { user, relation, type },
      { storeId: resolved.store!, authorizationModelId: resolved.model! },
    );
    return response.objects ?? [];
  } catch (e) {
    return `❌ Failed to list objects! Error: ${errorMessage(e)}`;
  }
}

export async function listUsers(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  object: string,
  relation: string,
  server?: string,
): Promise<string | string[]> {
  const offline = checkOfflineMode(ctx, "Listing users");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { server, store, model });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, resolved.store, resolved.model);
  if (restrict) return restrict;

  try {
    const response = await resolved.client.listUsers(
      { object: parseEntityString(object), relation, user_filters: [{ type: "user" }] },
      { storeId: resolved.store!, authorizationModelId: resolved.model! },
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
