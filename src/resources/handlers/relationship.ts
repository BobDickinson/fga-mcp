import { checkOfflineModeResource } from "../../guards.js";
import { requireClient, type ServerContext } from "../../client.js";
import { errorMessage, extractUsersFromTree, readAllRelationships, readAllTupleField } from "./utils.js";

export async function checkPermission(
  ctx: ServerContext,
  storeId: string,
  user: string,
  relation: string,
  object: string,
  modelId = "",
): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Checking permission");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).check(
      { user, relation, object },
      { storeId, authorizationModelId: modelId || "latest" },
    );
    return { allowed: response.allowed, user, relation, object, resolution: response.resolution };
  } catch (e) {
    return { error: `❌ Failed to check permission! Error: ${errorMessage(e)}` };
  }
}

export async function expandRelationships(
  ctx: ServerContext,
  storeId: string,
  object: string,
  relation: string,
): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Expanding relationships");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).expand({ object, relation }, { storeId });
    const users = extractUsersFromTree(response.tree);
    return { object, relation, users, count: users.length };
  } catch (e) {
    return { error: `❌ Failed to expand relationships! Error: ${errorMessage(e)}` };
  }
}

export async function listObjects(ctx: ServerContext, storeId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Listing objects");
  if (guard) return guard;

  try {
    const objects = await readAllTupleField(ctx, storeId, "object");
    return { store_id: storeId, objects, count: objects.length };
  } catch (e) {
    return { error: `❌ Failed to read tuples! Error: ${errorMessage(e)}` };
  }
}

export async function listUsers(ctx: ServerContext, storeId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Listing users");
  if (guard) return guard;

  try {
    const users = await readAllTupleField(ctx, storeId, "user");
    return { store_id: storeId, users, count: users.length };
  } catch (e) {
    return { error: `❌ Failed to read tuples! Error: ${errorMessage(e)}` };
  }
}

export async function listRelationships(ctx: ServerContext, storeId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Listing relationships");
  if (guard) return guard;

  try {
    const relationships = await readAllRelationships(ctx, storeId);
    return { store_id: storeId, relationships, count: relationships.length };
  } catch (e) {
    return { error: `❌ Failed to read tuples! Error: ${errorMessage(e)}` };
  }
}
