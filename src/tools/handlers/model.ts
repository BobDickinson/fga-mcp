import {
  checkOfflineMode,
  checkRestrictedMode,
  checkRestrictedModeForWrites,
  checkWritePermission,
} from "../../guards.js";
import { requireClient, type ServerContext } from "../../client.js";
import { modelToDsl, parseDsl, verifyDsl } from "../../dsl.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createModel(ctx: ServerContext, dsl: string, store: string): Promise<string> {
  const guards = [
    checkOfflineMode("Creating authorization models"),
    checkWritePermission("create authorization models"),
    checkRestrictedModeForWrites("create authorization models"),
    checkRestrictedMode(store),
  ];
  for (const g of guards) if (g) return g;

  try {
    const body = parseDsl(dsl);
    const response = await requireClient(ctx).writeAuthorizationModel(body, { storeId: store });
    return `✅ Successfully created authorization model! Model ID: ${response.authorization_model_id}`;
  } catch (e) {
    return `❌ Failed to create authorization model! Error: ${errorMessage(e)}`;
  }
}

export async function getModel(ctx: ServerContext, store: string, model: string): Promise<string> {
  const guards = [checkOfflineMode("Getting authorization model"), checkRestrictedMode(store, model)];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).readAuthorizationModel({ storeId: store, authorizationModelId: model });
    const id = response.authorization_model?.id;
    return id ? `✅ Found authorization model! Model ID: ${id}` : "❌ Authorization model not found!";
  } catch (e) {
    return `❌ Failed to get authorization model! Error: ${errorMessage(e)}`;
  }
}

export async function getModelDsl(ctx: ServerContext, store: string, model: string): Promise<string> {
  const guards = [checkOfflineMode("Getting authorization model DSL"), checkRestrictedMode(store, model)];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).readAuthorizationModel({ storeId: store, authorizationModelId: model });
    const authModel = response.authorization_model;
    if (!authModel) return "❌ Authorization model not found!";
    return modelToDsl(authModel);
  } catch (e) {
    return `❌ Failed to get authorization model! Error: ${errorMessage(e)}`;
  }
}

export async function listModels(ctx: ServerContext, store: string): Promise<string | Array<{ id: string | undefined }>> {
  const guards = [checkOfflineMode("Listing authorization models"), checkRestrictedMode(store)];
  for (const g of guards) if (g) return g;

  try {
    const response = await requireClient(ctx).readAuthorizationModels({ storeId: store });
    return (response.authorization_models ?? []).map((m) => ({ id: m.id }));
  } catch (e) {
    return `❌ Failed to list authorization models! Error: ${errorMessage(e)}`;
  }
}

export async function verifyModel(ctx: ServerContext, dsl: string): Promise<string> {
  const guard = checkOfflineMode("Verifying authorization model");
  if (guard) return guard;

  try {
    verifyDsl(dsl);
    return "✅ Successfully verified! This DSL appears to represent a valid authorization model.";
  } catch (e) {
    return `❌ Failed to verify authorization model! Error: ${errorMessage(e)}`;
  }
}
