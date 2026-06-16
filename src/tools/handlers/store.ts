import {
  checkOfflineMode,
  checkRestrictedMode,
  checkRestrictedModeForWrites,
  checkWritePermission,
} from "../../guards.js";
import { requireClient, type ServerContext } from "../../client.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createStore(ctx: ServerContext, name: string): Promise<string> {
  const guards = [
    checkOfflineMode("Creating stores"),
    checkWritePermission("create stores"),
    checkRestrictedModeForWrites("create stores"),
  ];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).createStore({ name });
    return `✅ Successfully created store named ${name}! Store names are not unique identifiers, so please use the ID ${response.id} for future queries relating to this specific store.`;
  } catch (e) {
    return `❌ Failed to create store! Error: ${errorMessage(e)}`;
  }
}

export async function deleteStore(ctx: ServerContext, id: string): Promise<string> {
  const guards = [
    checkOfflineMode("Deleting stores"),
    checkWritePermission("delete stores"),
    checkRestrictedModeForWrites("delete stores"),
  ];
  for (const g of guards) if (g) return g;

  try {
    await requireClient(ctx).deleteStore({ storeId: id });
    return "✅ Successfully deleted store!";
  } catch (e) {
    return `❌ Failed to delete store! Error: ${errorMessage(e)}`;
  }
}

export async function getStore(ctx: ServerContext, id: string): Promise<string | Record<string, unknown>> {
  const guards = [checkOfflineMode("Getting store details"), checkRestrictedMode(id)];
  for (const g of guards) if (g) return g;

  try {
    const store = await requireClient(ctx).getStore({ storeId: id });
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

export async function listStores(ctx: ServerContext): Promise<string | Array<Record<string, unknown>>> {
  const guard = checkOfflineMode("Listing stores");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).listStores();
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
