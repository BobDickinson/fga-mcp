import { transformer, validator } from "@openfga/syntax-transformer";
import type { AuthorizationModel, WriteAuthorizationModelRequest } from "@openfga/sdk";

export function parseDsl(dsl: string): WriteAuthorizationModelRequest {
  validator.validateDSL(dsl);
  const model = transformer.transformDSLToJSONObject(dsl) as AuthorizationModel;
  return {
    schema_version: model.schema_version ?? "1.1",
    type_definitions: model.type_definitions ?? [],
    conditions: model.conditions,
  };
}

export function verifyDsl(dsl: string): void {
  validator.validateDSL(dsl);
}

export function modelToDsl(model: AuthorizationModel): string {
  return transformer.transformJSONToDSL(model);
}

export function parseEntityString(value: string): { type: string; id: string } {
  const separator = value.indexOf(":");
  if (separator === -1) {
    return { type: value, id: "" };
  }
  return { type: value.slice(0, separator), id: value.slice(separator + 1) };
}
