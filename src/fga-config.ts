import { readFileSync } from "node:fs";
import { getConfiguredString } from "./config.js";

export type FgaDefaultsConfig = {
  writeable?: boolean;
  restrict?: boolean;
  default_store?: string;
  default_model?: string;
};

export type ApiTokenAuth = {
  method: "api_token";
  token: string;
};

export type ClientCredentialsAuth = {
  method: "client_credentials";
  client_id: string;
  client_secret: string;
  issuer: string;
  audience?: string;
  scopes?: string;
};

export type ServerAuth = ApiTokenAuth | ClientCredentialsAuth;

export type FgaServerConfig = {
  api_url: string;
  auth?: ServerAuth;
  label?: string;
  default_store?: string;
  default_model?: string;
  writeable?: boolean;
  restrict?: boolean;
};

export type FgaDynamicConfig = {
  scope_idle_ttl_seconds?: number | null;
  max_servers_per_scope?: number | null;
  max_scopes?: number | null;
};

export type FgaConfigDocument = {
  default_server?: string;
  /** When true, connect_server may register arbitrary api_url backends (dynamic tier). */
  allow_dynamic_connections?: boolean;
  dynamic?: FgaDynamicConfig;
  defaults?: FgaDefaultsConfig;
  servers?: Record<string, FgaServerConfig>;
};

export type FgaConfigLoadResult =
  | { ok: true; config: FgaConfigDocument; source: "file" | "legacy-env" }
  | { ok: false; errors: string[] };

const FLAT_CREDENTIAL_FIELDS = [
  "api_token",
  "client_id",
  "client_secret",
  "issuer",
  "audience",
  "scopes",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
  prefix: string,
  errors: string[],
): string | undefined {
  const field = obj[key];
  if (field === undefined) return undefined;
  if (typeof field !== "string") {
    errors.push(`${prefix}.${key} must be a string`);
    return undefined;
  }
  return field;
}

function readRequiredString(
  obj: Record<string, unknown>,
  key: string,
  prefix: string,
  errors: string[],
): string | undefined {
  const field = readOptionalString(obj, key, prefix, errors);
  if (field === undefined) {
    errors.push(`${prefix}.${key} is required`);
    return undefined;
  }
  if (field.trim() === "") {
    errors.push(`${prefix}.${key} must be a non-empty string`);
    return undefined;
  }
  return field;
}

export function readServerAuth(name: string, value: unknown, errors: string[]): ServerAuth | undefined {
  if (value === undefined) return undefined;

  const prefix = `servers.${name}.auth`;
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`);
    return undefined;
  }

  const method = value.method;
  if (typeof method !== "string") {
    errors.push(`${prefix}.method is required`);
    return undefined;
  }

  if (method === "api_token") {
    const token = readRequiredString(value, "token", prefix, errors);
    if (token === undefined) return undefined;
    return { method: "api_token", token };
  }

  if (method === "client_credentials") {
    const clientId = readRequiredString(value, "client_id", prefix, errors);
    const clientSecret = readRequiredString(value, "client_secret", prefix, errors);
    const issuer = readRequiredString(value, "issuer", prefix, errors);
    if (clientId === undefined || clientSecret === undefined || issuer === undefined) {
      return undefined;
    }

    const auth: ClientCredentialsAuth = {
      method: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      issuer,
    };

    const audience = readOptionalString(value, "audience", prefix, errors);
    const scopes = readOptionalString(value, "scopes", prefix, errors);
    if (audience !== undefined) auth.audience = audience;
    if (scopes !== undefined) auth.scopes = scopes;

    return auth;
  }

  errors.push(`${prefix}.method must be "api_token" or "client_credentials"`);
  return undefined;
}

export function buildServerAuth(input: {
  apiToken?: string;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  audience?: string;
  scopes?: string;
}): ServerAuth | undefined {
  const token = input.apiToken?.trim() ?? "";
  const clientId = input.clientId?.trim() ?? "";

  if (token !== "" && clientId !== "") {
    throw new Error("Provide either api_token or client credentials, not both.");
  }

  if (token !== "") {
    return { method: "api_token", token };
  }

  if (clientId !== "") {
    return {
      method: "client_credentials",
      client_id: clientId,
      client_secret: input.clientSecret?.trim() ?? "",
      issuer: input.issuer?.trim() ?? "",
      ...(input.audience?.trim() ? { audience: input.audience.trim() } : {}),
      ...(input.scopes?.trim() ? { scopes: input.scopes.trim() } : {}),
    };
  }

  return undefined;
}

function readServerConfig(name: string, value: unknown, errors: string[]): FgaServerConfig | null {
  if (!isRecord(value)) {
    errors.push(`servers.${name} must be an object`);
    return null;
  }

  const apiUrl = value.api_url;
  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    errors.push(`servers.${name}.api_url is required`);
    return null;
  }

  const flatPresent = FLAT_CREDENTIAL_FIELDS.some((key) => value[key] !== undefined);
  if (flatPresent && value.auth !== undefined) {
    errors.push(
      `servers.${name}: credential fields must be nested under auth, not set at the top level together with auth`,
    );
    return null;
  }

  if (flatPresent) {
    errors.push(
      `servers.${name}: credential fields must be nested under auth (e.g. auth: { "method": "api_token", "token": "..." })`,
    );
    return null;
  }

  const server: FgaServerConfig = { api_url: apiUrl.trim() };

  const auth = readServerAuth(name, value.auth, errors);
  if (auth) server.auth = auth;

  for (const key of ["label", "default_store", "default_model"] as const) {
    const field = value[key];
    if (field !== undefined) {
      if (typeof field !== "string") {
        errors.push(`servers.${name}.${key} must be a string`);
        return null;
      }
      server[key] = field;
    }
  }

  for (const key of ["writeable", "restrict"] as const) {
    const field = value[key];
    if (field !== undefined) {
      if (typeof field !== "boolean") {
        errors.push(`servers.${name}.${key} must be a boolean`);
        return null;
      }
      server[key] = field;
    }
  }

  return server;
}

function validateRestrictPins(config: FgaConfigDocument, errors: string[]): void {
  const globalDefaults = config.defaults ?? {};

  for (const [name, server] of Object.entries(config.servers ?? {})) {
    const restrict = server.restrict ?? globalDefaults.restrict ?? false;
    if (!restrict) continue;

    const defaultStore = server.default_store ?? globalDefaults.default_store;
    const defaultModel = server.default_model ?? globalDefaults.default_model;

    if (!defaultStore && !defaultModel) {
      errors.push(`servers.${name}: restrict requires default_store and/or default_model`);
    }

    if (defaultModel && !defaultStore) {
      errors.push(`servers.${name}: default_model requires default_store when restrict is enabled`);
    }
  }
}

export function parseFgaConfigDocument(raw: unknown): FgaConfigLoadResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ["FGA config must be a JSON object"] };
  }

  const config: FgaConfigDocument = {};

  if (raw.default_server !== undefined) {
    if (typeof raw.default_server !== "string" || raw.default_server.trim() === "") {
      errors.push("default_server must be a non-empty string");
    } else {
      config.default_server = raw.default_server.trim();
    }
  }

  const allowDynamicRaw = raw.allow_dynamic_connections ?? raw.allow_runtime_connect;
  if (allowDynamicRaw !== undefined) {
    if (typeof allowDynamicRaw !== "boolean") {
      errors.push("allow_dynamic_connections must be a boolean");
    } else {
      config.allow_dynamic_connections = allowDynamicRaw;
    }
  }
  if (raw.allow_runtime_connect !== undefined && raw.allow_dynamic_connections === undefined) {
    // Deprecated alias — allow_runtime_connect still accepted for migration
  }

  if (raw.dynamic !== undefined) {
    if (!isRecord(raw.dynamic)) {
      errors.push("dynamic must be an object");
    } else {
      const dynamic: FgaDynamicConfig = {};
      for (const key of ["scope_idle_ttl_seconds", "max_servers_per_scope", "max_scopes"] as const) {
        const value = raw.dynamic[key];
        if (value === undefined) continue;
        if (value === null) {
          dynamic[key] = null;
          continue;
        }
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          errors.push(`dynamic.${key} must be a non-negative number or null`);
        } else {
          dynamic[key] = Math.trunc(value);
        }
      }
      config.dynamic = dynamic;
    }
  }

  if (raw.defaults !== undefined) {
    if (!isRecord(raw.defaults)) {
      errors.push("defaults must be an object");
    } else {
      const defaults: FgaDefaultsConfig = {};
      for (const key of ["default_store", "default_model"] as const) {
        const value = raw.defaults[key];
        if (value !== undefined) {
          if (typeof value !== "string") errors.push(`defaults.${key} must be a string`);
          else defaults[key] = value;
        }
      }
      for (const key of ["writeable", "restrict"] as const) {
        const value = raw.defaults[key];
        if (value !== undefined) {
          if (typeof value !== "boolean") errors.push(`defaults.${key} must be a boolean`);
          else defaults[key] = value;
        }
      }
      config.defaults = defaults;
    }
  }

  if (raw.servers !== undefined) {
    if (!isRecord(raw.servers)) {
      errors.push("servers must be an object");
    } else {
      const servers: Record<string, FgaServerConfig> = {};
      for (const [name, value] of Object.entries(raw.servers)) {
        const parsed = readServerConfig(name, value, errors);
        if (parsed) servers[name] = parsed;
      }
      config.servers = servers;
    }
  }

  validateRestrictPins(config, errors);

  if (config.default_server && config.servers && !(config.default_server in config.servers)) {
    errors.push(`default_server "${config.default_server}" is not defined in servers`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, config, source: "file" };
}

export function loadFgaConfigFromFile(path: string): FgaConfigLoadResult {
  try {
    const contents = readFileSync(path, "utf8");
    const parsed = JSON.parse(contents) as unknown;
    const result = parseFgaConfigDocument(parsed);
    if (result.ok) return { ...result, source: "file" };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`Failed to load FGA config from ${path}: ${message}`] };
  }
}

export function loadLegacyEnvFgaConfig(): FgaConfigLoadResult {
  const apiUrl = getConfiguredString("OPENFGA_MCP_API_URL", "");
  const token = getConfiguredString("OPENFGA_MCP_API_TOKEN", "");
  const clientId = getConfiguredString("OPENFGA_MCP_API_CLIENT_ID", "");
  const clientSecret = getConfiguredString("OPENFGA_MCP_API_CLIENT_SECRET", "");
  const issuer = getConfiguredString("OPENFGA_MCP_API_ISSUER", "");
  const audience = getConfiguredString("OPENFGA_MCP_API_AUDIENCE", "");

  if (apiUrl === "" && token === "" && clientId === "") {
    return { ok: true, config: {}, source: "legacy-env" };
  }

  const server: FgaServerConfig = {
    api_url: apiUrl !== "" ? apiUrl : "http://127.0.0.1:8080",
  };

  const auth = buildServerAuth({
    apiToken: token !== "" ? token : undefined,
    clientId: clientId !== "" ? clientId : undefined,
    clientSecret: clientSecret !== "" ? clientSecret : undefined,
    issuer: issuer !== "" ? issuer : undefined,
    audience: audience !== "" ? audience : undefined,
  });
  if (auth) server.auth = auth;

  const defaults: FgaDefaultsConfig = {};
  const writeable = getConfiguredString("OPENFGA_MCP_API_WRITEABLE", "");
  const restrict = getConfiguredString("OPENFGA_MCP_API_RESTRICT", "");
  const store = getConfiguredString("OPENFGA_MCP_API_STORE", "");
  const model = getConfiguredString("OPENFGA_MCP_API_MODEL", "");

  if (writeable === "true") defaults.writeable = true;
  if (restrict === "true") defaults.restrict = true;
  if (store !== "") defaults.default_store = store;
  if (model !== "") defaults.default_model = model;

  const config: FgaConfigDocument = {
    default_server: "default",
    servers: { default: server },
  };

  if (Object.keys(defaults).length > 0) config.defaults = defaults;

  const result = parseFgaConfigDocument(config);
  if (result.ok) return { ...result, source: "legacy-env" };
  return result;
}

export function loadFgaConfig(configPath?: string): FgaConfigLoadResult {
  if (configPath) {
    const fromFile = loadFgaConfigFromFile(configPath);
    if (fromFile.ok) return fromFile;
    return fromFile;
  }

  const inline = getConfiguredString("OPENFGA_MCP_CONFIG", "");
  if (inline.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(inline) as unknown;
      const result = parseFgaConfigDocument(parsed);
      if (result.ok) return { ...result, source: "file" };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, errors: [`Invalid OPENFGA_MCP_CONFIG JSON: ${message}`] };
    }
  }

  if (inline !== "") {
    return loadFgaConfigFromFile(inline);
  }

  return loadLegacyEnvFgaConfig();
}
