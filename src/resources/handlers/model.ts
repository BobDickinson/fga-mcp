import { checkOfflineModeResource } from "../../guards.js";
import { requireClient, type ServerContext } from "../../client.js";
import { errorMessage, formatModelData } from "./utils.js";

export async function getLatestModel(ctx: ServerContext, storeId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Getting latest model");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).readAuthorizationModels({ storeId });
    const latest = response.authorization_models?.[0];
    if (!latest) return { error: "❌ No models found in the store" };
    return formatModelData(latest, storeId, true);
  } catch (e) {
    return { error: `❌ Failed to fetch models! Error: ${errorMessage(e)}` };
  }
}

export async function getModel(ctx: ServerContext, storeId: string, modelId: string): Promise<Record<string, unknown>> {
  const guard = checkOfflineModeResource(ctx, "Getting model details");
  if (guard) return guard;

  try {
    const response = await requireClient(ctx).readAuthorizationModel({ storeId, authorizationModelId: modelId });
    const model = response.authorization_model;
    if (!model) return { error: "❌ Model not found" };
    return formatModelData(model, storeId);
  } catch (e) {
    return { error: `❌ Failed to fetch model! Error: ${errorMessage(e)}` };
  }
}
