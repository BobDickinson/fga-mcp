import type { FastMCP } from "fastmcp";
import { ConfigurationParser } from "./configuration-parser.js";
import { logServerLifecycle } from "./debug-logger.js";

const parser = new ConfigurationParser({
  debug(message, context) {
    logServerLifecycle("http_config_debug", { message, ...(context ?? {}) });
  },
  warning(message, context) {
    logServerLifecycle("http_config_warning", { message, ...(context ?? {}) });
  },
});

export function applyHttpConfiguration(jsonConfig: string): ReturnType<ConfigurationParser["parseAndApply"]> {
  const result = parser.parseAndApply(jsonConfig);

  if (!result.isSuccessful()) {
    logServerLifecycle("http_config_apply_failed", { errors: result.getErrors() });
  } else {
    logServerLifecycle("http_config_applied", {
      source: "query_param",
      keys: result.getAppliedKeys(),
    });
  }

  return result;
}

/**
 * Apply per-request MCP configuration from the `config` query parameter (URL-encoded JSON).
 * Mirrors PHP ConfigurableHttpServerTransport::applyConfiguration().
 */
export function registerConfigurableHttpMiddleware(server: FastMCP, mcpPath = "/mcp"): void {
  const app = server.getApp();

  app.use(mcpPath, async (c, next) => {
    const configParam = c.req.query("config");
    if (configParam) {
      try {
        const decoded = decodeURIComponent(configParam);
        applyHttpConfiguration(decoded);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logServerLifecycle("http_config_decode_failed", { error: message });
      }
    }
    await next();
  });

  logServerLifecycle("configurable_http_transport_initialized", {
    mcp_path: mcpPath,
    note: "Query parameter configuration support is enabled",
  });
}
