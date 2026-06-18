import { resolveAdminTarget, resolveTupleTarget } from "../../admin-context.js";
import { checkOfflineMode, checkRestrictedMode, checkWritePermission } from "../../guards.js";
import type { ServerContext } from "../../client.js";
import type { ToolCallContext } from "../../elicitation/types.js";
import { modelToDsl, parseDsl, verifyDsl } from "../../dsl.js";
import { formatFgaApiError } from "./fga-api-error.js";

export async function createModel(
  ctx: ServerContext,
  dsl: string,
  store: string | undefined,
  server?: string,
  connectionScope?: string,
  toolCtx?: ToolCallContext,
): Promise<string> {
  const offline = checkOfflineMode(ctx, "Creating authorization models");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { connectionScope, server, store });
  if (typeof resolved === "string") return resolved;

  const guards = [
    checkWritePermission(resolved.policy, "create authorization models"),
    checkRestrictedMode(resolved.policy, resolved.store, resolved.model),
  ];
  for (const g of guards) if (g) return g;

  try {
    const body = parseDsl(dsl);
    const response = await resolved.client.writeAuthorizationModel(body, { storeId: resolved.store! });
    return `✅ Successfully created authorization model! Model ID: ${response.authorization_model_id}`;
  } catch (e) {
    return formatFgaApiError(ctx, resolved, e, toolCtx, "Failed to create authorization model!");
  }
}

export async function getModel(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  server?: string,
  connectionScope?: string,
  toolCtx?: ToolCallContext,
): Promise<string> {
  const offline = checkOfflineMode(ctx, "Getting authorization model");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { connectionScope, server, store, model });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, resolved.store, resolved.model);
  if (restrict) return restrict;

  try {
    const response = await resolved.client.readAuthorizationModel({
      storeId: resolved.store!,
      authorizationModelId: resolved.model!,
    });
    const id = response.authorization_model?.id;
    return id ? `✅ Found authorization model! Model ID: ${id}` : "❌ Authorization model not found!";
  } catch (e) {
    return formatFgaApiError(ctx, resolved, e, toolCtx, "Failed to get authorization model!");
  }
}

export async function getModelDsl(
  ctx: ServerContext,
  store: string | undefined,
  model: string | undefined,
  server?: string,
  connectionScope?: string,
  toolCtx?: ToolCallContext,
): Promise<string> {
  const offline = checkOfflineMode(ctx, "Getting authorization model DSL");
  if (offline) return offline;

  const resolved = resolveTupleTarget(ctx, { connectionScope, server, store, model });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, resolved.store, resolved.model);
  if (restrict) return restrict;

  try {
    const response = await resolved.client.readAuthorizationModel({
      storeId: resolved.store!,
      authorizationModelId: resolved.model!,
    });
    const authModel = response.authorization_model;
    if (!authModel) return "❌ Authorization model not found!";
    return modelToDsl(authModel);
  } catch (e) {
    return formatFgaApiError(ctx, resolved, e, toolCtx, "Failed to get authorization model!");
  }
}

export async function listModels(
  ctx: ServerContext,
  store: string | undefined,
  server?: string,
  connectionScope?: string,
  toolCtx?: ToolCallContext,
): Promise<string | Array<{ id: string | undefined }>> {
  const offline = checkOfflineMode(ctx, "Listing authorization models");
  if (offline) return offline;

  const resolved = resolveAdminTarget(ctx, { connectionScope, server, store, requireStore: true });
  if (typeof resolved === "string") return resolved;

  const restrict = checkRestrictedMode(resolved.policy, resolved.store, undefined);
  if (restrict) return restrict;

  try {
    const response = await resolved.client.readAuthorizationModels({ storeId: resolved.store! });
    return (response.authorization_models ?? []).map((m) => ({ id: m.id }));
  } catch (e) {
    return formatFgaApiError(ctx, resolved, e, toolCtx, "Failed to list authorization models!");
  }
}

export async function verifyModel(ctx: ServerContext, dsl: string): Promise<string> {
  try {
    verifyDsl(dsl);
    return "✅ Successfully verified! This DSL appears to represent a valid authorization model.";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `❌ Failed to verify authorization model! Error: ${message}`;
  }
}
