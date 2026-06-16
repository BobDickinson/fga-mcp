import { checkOfflineModeResource } from "../../guards.js";
import { requireClient, type ServerContext } from "../../client.js";
import { errorMessage } from "./utils.js";

export async function listStores(ctx: ServerContext): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Listing stores");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).listStores();
    const stores = (response.stores ?? []).map((store) => ({
      id: store.id,
      name: store.name,
      created_at: store.created_at,
      updated_at: store.updated_at,
      deleted_at: store.deleted_at ?? null,
    }));
    return { stores, count: stores.length };
  } catch (e) {
    return { error: `❌ Failed to fetch stores! Error: ${errorMessage(e)}` };
  }
}

export async function getStore(ctx: ServerContext, storeId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Fetching store details");
  if (guard) return guard;

  try {
    const store = await requireClient(ctx).getStore({ storeId });
    return {
      id: store.id,
      name: store.name,
      created_at: store.created_at,
      updated_at: store.updated_at,
      deleted_at: store.deleted_at ?? null,
    };
  } catch (e) {
    return { error: `❌ Failed to fetch store! Error: ${errorMessage(e)}` };
  }
}

export async function listStoreModels(ctx: ServerContext, storeId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Listing store models");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).readAuthorizationModels({ storeId });
    const models = (response.authorization_models ?? []).map((model) => ({
      id: model.id,
      created_at: null,
      schema_version: "1.1",
      type_definitions: model.type_definitions?.length ?? 0,
    }));
    return { store_id: storeId, models, count: models.length };
  } catch (e) {
    return { error: `❌ Failed to fetch models! Error: ${errorMessage(e)}` };
  }
}
