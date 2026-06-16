import { ConfigurationResult } from "./configuration-result.js";

export interface ConfigurationLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warning(message: string, context?: Record<string, unknown>): void;
}

const NULL_LOGGER: ConfigurationLogger = {
  debug() {},
  warning() {},
};

const SUPPORTED_CONFIG: Record<string, "string" | "int" | "bool"> = {
  OPENFGA_MCP_API_URL: "string",
  OPENFGA_MCP_API_TOKEN: "string",
  OPENFGA_MCP_API_CLIENT_ID: "string",
  OPENFGA_MCP_API_CLIENT_SECRET: "string",
  OPENFGA_MCP_API_ISSUER: "string",
  OPENFGA_MCP_API_AUDIENCE: "string",
  OPENFGA_MCP_API_WRITEABLE: "bool",
  OPENFGA_MCP_API_RESTRICT: "bool",
  OPENFGA_MCP_API_STORE: "string",
  OPENFGA_MCP_API_MODEL: "string",
  OPENFGA_MCP_TRANSPORT: "string",
  OPENFGA_MCP_TRANSPORT_HOST: "string",
  OPENFGA_MCP_TRANSPORT_PORT: "int",
  OPENFGA_MCP_TRANSPORT_SSE: "bool",
  OPENFGA_MCP_TRANSPORT_STATELESS: "bool",
  OPENFGA_MCP_DEBUG: "bool",
};

const SENSITIVE_KEYS = new Set(["OPENFGA_MCP_API_TOKEN", "OPENFGA_MCP_API_CLIENT_SECRET"]);

export class ConfigurationParser {
  private readonly logger: ConfigurationLogger;

  constructor(logger: ConfigurationLogger | null = null) {
    this.logger = logger ?? NULL_LOGGER;
  }

  parseAndApply(jsonConfig: string, env: NodeJS.ProcessEnv = process.env): ConfigurationResult {
    const errors: string[] = [];
    const appliedKeys: string[] = [];
    const appliedValues: Record<string, string> = {};

    let config: unknown;
    try {
      config = JSON.parse(jsonConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Invalid JSON: ${message}`);
      return new ConfigurationResult(false, errors, appliedKeys, appliedValues);
    }

    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      errors.push("Configuration must be a JSON object");
      return new ConfigurationResult(false, errors, appliedKeys, appliedValues);
    }

    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      if (!(key in SUPPORTED_CONFIG)) {
        this.logger.warning("Unsupported configuration key", { key });
        continue;
      }

      const expectedType = SUPPORTED_CONFIG[key];
      const processedValue = this.processValue(value, expectedType, key, errors);

      if (processedValue !== null) {
        env[key] = processedValue;
        appliedKeys.push(key);
        appliedValues[key] = processedValue;

        this.logger.debug("Configuration value set", {
          key,
          type: expectedType,
          value: this.maskSensitiveValue(key, processedValue),
        });
      }
    }

    this.validateConfigurationCombinations(appliedValues, errors);

    return new ConfigurationResult(errors.length === 0, errors, appliedKeys, appliedValues);
  }

  private maskSensitiveValue(key: string, value: string): string {
    if (SENSITIVE_KEYS.has(key) && value.length > 4) {
      return value.slice(0, 4) + "*".repeat(Math.min(12, value.length - 4));
    }
    return value;
  }

  private processValue(
    value: unknown,
    expectedType: "string" | "int" | "bool",
    key: string,
    errors: string[],
  ): string | null {
    switch (expectedType) {
      case "string":
        if (typeof value !== "string" && typeof value !== "number") {
          errors.push(`${key} must be a string, ${typeof value} given`);
          return null;
        }
        return String(value);

      case "int":
        if (typeof value === "number" && Number.isFinite(value)) {
          return String(Math.trunc(value));
        }
        if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
          return String(Math.trunc(Number(value)));
        }
        errors.push(`${key} must be numeric, ${typeof value} given`);
        return null;

      case "bool":
        if (typeof value === "boolean") {
          return value ? "true" : "false";
        }
        if (typeof value === "string") {
          const normalized = value.toLowerCase();
          if (["true", "false", "1", "0"].includes(normalized)) {
            return ["true", "1"].includes(normalized) ? "true" : "false";
          }
        }
        if (typeof value === "number") {
          return value ? "true" : "false";
        }
        errors.push(`${key} must be a boolean, ${typeof value} given`);
        return null;

      default:
        errors.push(`Unknown type ${expectedType as string} for key ${key}`);
        return null;
    }
  }

  private validateConfigurationCombinations(config: Record<string, string>, errors: string[]): void {
    const hasClientId = Boolean(config.OPENFGA_MCP_API_CLIENT_ID);
    const hasClientSecret = Boolean(config.OPENFGA_MCP_API_CLIENT_SECRET);
    const hasIssuer = Boolean(config.OPENFGA_MCP_API_ISSUER);
    const hasAudience = Boolean(config.OPENFGA_MCP_API_AUDIENCE);

    if ((hasClientId || hasClientSecret) && (!hasClientId || !hasClientSecret || !hasIssuer || !hasAudience)) {
      errors.push(
        "OAuth2 client credentials require all of: OPENFGA_MCP_API_CLIENT_ID, OPENFGA_MCP_API_CLIENT_SECRET, OPENFGA_MCP_API_ISSUER, OPENFGA_MCP_API_AUDIENCE",
      );
    }

    if (config.OPENFGA_MCP_API_RESTRICT === "true") {
      const hasStore = Boolean(config.OPENFGA_MCP_API_STORE);
      const hasModel = Boolean(config.OPENFGA_MCP_API_MODEL);

      if (!hasStore || !hasModel) {
        errors.push("Restricted mode requires both OPENFGA_MCP_API_STORE and OPENFGA_MCP_API_MODEL to be set");
      }
    }
  }
}
