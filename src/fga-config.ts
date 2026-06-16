import { readFileSync } from "node:fs";
import { getConfiguredString } from "./config.js";

export type FgaDefaultsConfig = {
  writeable?: boolean;
  restrict?: boolean;
  default_store?: string;
  default_model?: string;
};

export type FgaServerConfig = {
  api_url: string;
  api_token?: string;
  client_id?: string;
  client_secret?: string;
  issuer?: string;
  audience?: string;
  label?: string;
  default_store?: string;
  default_model?: string;
  writeable?: boolean;
  restrict?: boolean;
};

export type FgaConfigDocument = {
  default_server?: string;
  allow_runtime_connect?: boolean;
  defaults?: FgaDefaultsConfig;
  servers?: Record<string, FgaServerConfig>;
};

export type FgaConfigLoadResult =
  | { ok: true; config: FgaConfigDocument; source: "file" | "legacy-env" }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  const server: FgaServerConfig = { api_url: apiUrl.trim() };

  for (const key of [
    "api_token",
    "client_id",
    "client_secret",
    "issuer",
    "audience",
    "label",
    "default_store",
    "default_model",
  ] as const) {
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

  if (raw.allow_runtime_connect !== undefined) {
    if (typeof raw.allow_runtime_connect !== "boolean") {
      errors.push("allow_runtime_connect must be a boolean");
    } else {
      config.allow_runtime_connect = raw.allow_runtime_connect;
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

  if (token !== "") server.api_token = token;
  if (clientId !== "") {
    server.client_id = clientId;
    server.client_secret = clientSecret;
    server.issuer = issuer;
    server.audience = audience;
  }

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
