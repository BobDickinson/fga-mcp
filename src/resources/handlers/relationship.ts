import type { ResourceTarget } from "../../resource-resolver.js";
import { errorMessage, extractUsersFromTree, readAllRelationships, readAllTupleField } from "./utils.js";

export async function checkPermission(
  target: ResourceTarget,
  storeId: string,
  user: string,
  relation: string,
  object: string,
  modelId = "",
): Promise<Record<string, unknown>> {
  try {
    const response = await target.client.check(
      { user, relation, object },
      { storeId, authorizationModelId: modelId || "latest" },
    );
    return { allowed: response.allowed, user, relation, object, resolution: response.resolution };
  } catch (e) {
    return { error: `❌ Failed to check permission! Error: ${errorMessage(e)}` };
  }
}

export async function expandRelationships(
  target: ResourceTarget,
  storeId: string,
  object: string,
  relation: string,
): Promise<Record<string, unknown>> {
  try {
    const response = await target.client.expand({ object, relation }, { storeId });
    const users = extractUsersFromTree(response.tree);
    return { object, relation, users, count: users.length };
  } catch (e) {
    return { error: `❌ Failed to expand relationships! Error: ${errorMessage(e)}` };
  }
}

export async function listObjects(target: ResourceTarget, storeId: string): Promise<Record<string, unknown>> {
  try {
    const objects = await readAllTupleField(target.client, storeId, "object");
    return { store_id: storeId, objects, count: objects.length };
  } catch (e) {
    return { error: `❌ Failed to read tuples! Error: ${errorMessage(e)}` };
  }
}

export async function listUsers(target: ResourceTarget, storeId: string): Promise<Record<string, unknown>> {
  try {
    const users = await readAllTupleField(target.client, storeId, "user");
    return { store_id: storeId, users, count: users.length };
  } catch (e) {
    return { error: `❌ Failed to read tuples! Error: ${errorMessage(e)}` };
  }
}

export async function listRelationships(target: ResourceTarget, storeId: string): Promise<Record<string, unknown>> {
  try {
    const relationships = await readAllRelationships(target.client, storeId);
    return { store_id: storeId, relationships, count: relationships.length };
  } catch (e) {
    return { error: `❌ Failed to read tuples! Error: ${errorMessage(e)}` };
  }
}
