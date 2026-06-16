import { resolveAdminTarget } from "../../admin-context.js";
import { checkOfflineMode, checkRestrictedMode, checkWritePermission } from "../../guards.js";
import type { ServerContext } from "../../client.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createStore(ctx: ServerContext, name: string, server?: string): Promise<string> {
  const offline = checkOfflineMode(ctx, "Creating stores");
  if (offline) return offline;

  const resolved = resolveAdminTarget(ctx, { server, requireStore: false });
  if (typeof resolved === "string") return resolved;

  const write = checkWritePermission(resolved.policy, "create stores");
  if (write) return write;

  try {
    const response = await resolved.client.createStore({ name });
    return `✅ Successfully created store named ${name}! Store names are not unique identifiers, so please use the ID ${response.id} for future queries relating to this specific store.`;
  } catch (e) {
    return `❌ Failed to create store! Error: ${errorMessage(e)}`;
  }
}

export async function deleteStore(ctx: ServerContext, id: string, server?: string): Promise<string> {
  const offline = checkOfflineMode(ctx, "Deleting stores");
  if (offline) return offline;

  const resolved = resolveAdminTarget(ctx, { server, store: id, requireStore: false });
  if (typeof resolved === "string") return resolved;

  const guards = [
    checkWritePermission(resolved.policy, "delete stores"),
    checkRestrictedMode(resolved.policy, id, undefined),
  ];
  for (const g of guards) if (g) return g;

  try {
    await resolved.client.deleteStore({ storeId: id });
    return "✅ Successfully deleted store!";
  } catch (e) {
    return `❌ Failed to delete store! Error: ${errorMessage(e)}`;
  }
}

export async function getStore(
  ctx: ServerContext,
  id: string,
  server?: string,
): Promise<string | Record<string, unknown>> {
  const offline = checkOfflineMode(ctx, "Getting store details");
  if (offline) return offline;

  const resolved = resolveAdminTarget(ctx, { server, requireStore: false });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, id, undefined);
  if (restrict) return restrict;

  try {
    const store = await resolved.client.getStore({ storeId: id });
    return {
      id: store.id,
      name: store.name,
      created_at: store.created_at,
      updated_at: store.updated_at,
      deleted_at: store.deleted_at ?? null,
    };
  } catch (e) {
    return `❌ Failed to get store! Error: ${errorMessage(e)}`;
  }
}

export async function listStores(ctx: ServerContext, server?: string): Promise<string | Array<Record<string, unknown>>> {
  const offline = checkOfflineMode(ctx, "Listing stores");
  if (offline) return offline;

  const resolved = resolveAdminTarget(ctx, { server, requireStore: false });
  if (typeof resolved === "string") return resolved;

  try {
    const response = await resolved.client.listStores();
    return (response.stores ?? []).map((store) => ({
      id: store.id,
      name: store.name,
      created_at: store.created_at,
      updated_at: store.updated_at,
      deleted_at: store.deleted_at ?? null,
    }));
  } catch (e) {
    return `❌ Failed to list stores! Error: ${errorMessage(e)}`;
  }
}
