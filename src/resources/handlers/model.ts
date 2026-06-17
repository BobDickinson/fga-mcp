import type { ResourceTarget } from "../../resource-resolver.js";
import { errorMessage, formatModelData } from "./utils.js";

export async function getLatestModel(target: ResourceTarget, storeId: string): Promise<Record<string, unknown>> {
  try {
    const response = await target.client.readAuthorizationModels({ storeId });
    const latest = response.authorization_models?.[0];
    if (!latest) return { error: "❌ No models found in the store" };
    return formatModelData(latest, storeId, true);
  } catch (e) {
    return { error: `❌ Failed to fetch models! Error: ${errorMessage(e)}` };
  }
}

export async function getModel(
  target: ResourceTarget,
  storeId: string,
  modelId: string,
): Promise<Record<string, unknown>> {
  try {
    const response = await target.client.readAuthorizationModel({ storeId, authorizationModelId: modelId });
    const model = response.authorization_model;
    if (!model) return { error: "❌ Model not found" };
    return formatModelData(model, storeId);
  } catch (e) {
    return { error: `❌ Failed to fetch model! Error: ${errorMessage(e)}` };
  }
}
