import type { ResourceTarget } from "../../resource-resolver.js";
import { errorMessage } from "./utils.js";

export async function listStores(target: ResourceTarget): Promise<Record<string, unknown>> {
  try {
    const response = await target.client.listStores();
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

export async function getStore(target: ResourceTarget, storeId: string): Promise<Record<string, unknown>> {
  try {
    const store = await target.client.getStore({ storeId });
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

export async function listStoreModels(target: ResourceTarget, storeId: string): Promise<Record<string, unknown>> {
  try {
    const response = await target.client.readAuthorizationModels({ storeId });
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
