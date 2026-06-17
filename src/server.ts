import { FastMCP } from "fastmcp";
import type { ServerContext } from "./client.js";
import { getConfiguredBool, getConfiguredInt, getConfiguredString } from "./config.js";
import { initializeDocumentationIndex } from "./documentation/index.js";
import { isDebugEnabled, logServerLifecycle } from "./debug-logger.js";
import { registerPrompts } from "./prompts/index.js";
import {
  registerDocumentationResources,
  registerModelResources,
  registerRelationshipResources,
  registerStoreResources,
} from "./resources/index.js";
import { registerDocumentationTools } from "./tools/documentation.js";
import { registerModelTools, registerRelationshipTools, registerServerManagementTools, registerStoreTools } from "./tools/openfga.js";

export const SERVER_NAME = "OpenFGA MCP Server";
export const SERVER_VERSION = "1.0.0";

export const EXPECTED_TOOL_NAMES = [
  "list_servers",
  "set_default_server",
  "connect_server",
  "disconnect_server",
  "create_store",
  "delete_store",
  "get_store",
  "list_stores",
  "check_permission",
  "grant_permission",
  "revoke_permission",
  "list_objects",
  "list_users",
  "create_model",
  "get_model",
  "get_model_dsl",
  "list_models",
  "verify_model",
  "find_similar_documentation",
  "search_code_examples",
  "search_documentation",
] as const;

export const DOCUMENTATION_STATIC_RESOURCE_NAMES = ["get_documentation_index"] as const;

export const DOCUMENTATION_RESOURCE_TEMPLATE_NAMES = [
  "get_documentation_overview",
  "get_class_documentation",
  "get_sdk_method_documentation",
  "get_documentation_section",
  "get_documentation_chunk",
  "search_documentation",
] as const;

export const LEGACY_ADMIN_STATIC_RESOURCE_NAMES = ["list_stores"] as const;

export const LEGACY_ADMIN_RESOURCE_TEMPLATE_NAMES = [
  "get_store",
  "list_models",
  "get_latest_model",
  "get_model",
  "check_permission",
  "expand_relationship",
  "list_objects",
  "list_users",
  "list_relationships",
] as const;

/** @deprecated Use context-specific constants; offline registers documentation only. */
export const EXPECTED_STATIC_RESOURCE_NAMES = [
  ...LEGACY_ADMIN_STATIC_RESOURCE_NAMES,
  ...DOCUMENTATION_STATIC_RESOURCE_NAMES,
] as const;

/** @deprecated Use context-specific constants; offline registers documentation only. */
export const EXPECTED_RESOURCE_TEMPLATE_NAMES = [
  ...LEGACY_ADMIN_RESOURCE_TEMPLATE_NAMES,
  ...DOCUMENTATION_RESOURCE_TEMPLATE_NAMES,
] as const;

export const EXPECTED_PROMPT_NAMES = [
  "convert_rbac_to_rebac",
  "design_model_for_domain",
  "model_hierarchical_relationships",
  "optimize_model_structure",
  "create_model_step_by_step",
  "design_relationship_patterns",
  "guide_model_authoring",
  "implement_custom_roles",
  "test_model_comprehensive",
  "audit_friendly_patterns",
  "implement_access_patterns",
  "implement_least_privilege",
  "security_review_model",
  "analyze_permission_inheritance",
  "debug_permission_denial",
  "optimize_relationship_queries",
  "troubleshoot_unexpected_access",
] as const;

export const SERVER_INSTRUCTIONS = `OpenFGA MCP server for authorization model design, SDK documentation, and store administration.

Discovery: Call list_servers first. It returns runtime_connect_enabled and fixed servers (fixed: true). If runtime_connect_enabled is true, use connect_server to add runtime backends; save connection_scope and assigned server from the response.

Routing admin and relationship tools: Omit connection_scope for fixed servers from startup config. For dynamic servers, pass both connection_scope and server (use the assigned name from connect_server, not necessarily requested_name). Omit server to use the default in that pool.

Optional: store and model default from server config when omitted. verify_model validates DSL locally and needs no server.

Policy: writeable: false blocks mutations (create, delete, grant, revoke). restrict: true limits reads and writes to pinned store or model. Check each list_servers entry for writeable and restrict.`;

export function createMcpServer(): FastMCP {
  return new FastMCP({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: SERVER_INSTRUCTIONS,
    logger: isDebugEnabled()
      ? {
          debug: (...args: unknown[]) => logServerLifecycle("transport_debug", { details: args }),
          error: (...args: unknown[]) => logServerLifecycle("transport_error", { details: args }),
          info: (...args: unknown[]) => logServerLifecycle("transport_info", { details: args }),
          log: (...args: unknown[]) => logServerLifecycle("transport_log", { details: args }),
          warn: (...args: unknown[]) => logServerLifecycle("transport_warning", { details: args }),
        }
      : undefined,
  });
}

export function registerMcpCapabilities(server: FastMCP, ctx: ServerContext): void {
  registerServerManagementTools(server, ctx);
  registerStoreTools(server, ctx);
  registerRelationshipTools(server, ctx);
  registerModelTools(server, ctx);
  registerDocumentationTools(server);
  registerStoreResources(server, ctx);
  registerModelResources(server, ctx);
  registerRelationshipResources(server, ctx);
  registerDocumentationResources(server);
  registerPrompts(server, ctx);
}

export function initializeDocumentationWithLogging(): void {
  process.stderr.write("[INFO] Initializing documentation index...\n");

  try {
    const start = performance.now();
    const docIndex = initializeDocumentationIndex();
    const sdks = docIndex.getSdkList();
    const loadTime = Math.round(performance.now() - start);
    process.stderr.write(`[INFO] Documentation index initialized successfully in ${loadTime}ms\n`);
    process.stderr.write(`[INFO] Loaded documentation for ${sdks.length} SDKs\n`);

    for (const sdk of sdks) {
      const overview = docIndex.getSdkOverview(sdk);
      if (overview) {
        process.stderr.write(
          `[INFO]   - ${overview.name}: ${overview.classes.length} classes, ${overview.sections.length} sections, ${overview.total_chunks} chunks\n`,
        );
      }
    }

    for (const generalDoc of ["general", "authoring"] as const) {
      const overview = docIndex.getSdkOverview(generalDoc);
      if (overview) {
        process.stderr.write(
          `[INFO]   - ${overview.name}: ${overview.sections.length} sections, ${overview.total_chunks} chunks\n`,
        );
      }
    }

    logServerLifecycle("documentation_initialized", {
      load_time_ms: loadTime,
      sdk_count: sdks.length,
      sdks: docIndex.getSdkList(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[WARNING] Failed to initialize documentation index: ${message}\n`);
    process.stderr.write("[WARNING] Documentation features will initialize on first use\n");

    logServerLifecycle("documentation_initialization_failed", {
      error: message,
    });
  }
}

export function logStartup(ctx: ServerContext): void {
  const apiUrl = getConfiguredString("OPENFGA_MCP_API_URL", "");
  logServerLifecycle("startup", {
    version: SERVER_VERSION,
    mode: ctx.offline ? "offline" : "online",
    transport: getConfiguredString("OPENFGA_MCP_TRANSPORT", "stdio"),
    debug: getConfiguredBool("OPENFGA_MCP_DEBUG", true),
    api_url: ctx.offline ? null : apiUrl !== "" ? apiUrl : "http://127.0.0.1:8080",
  });
}

export function registerProcessLifecycleHandlers(onShutdown?: () => void): void {
  process.on("uncaughtException", (error) => {
    logServerLifecycle("uncaught_exception", {
      error: error.message,
      class: error.name,
      stack: error.stack,
    });
    process.stderr.write(`[UNCAUGHT EXCEPTION] ${error.message}\n`);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logServerLifecycle("uncaught_exception", {
      error: message,
      class: reason instanceof Error ? reason.name : "UnhandledRejection",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    process.stderr.write(`[UNHANDLED REJECTION] ${message}\n`);
    process.exit(1);
  });

  const shutdown = (reason: string) => {
    logServerLifecycle("shutdown", { reason });
    onShutdown?.();
  };

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT");
    process.exit(0);
  });

  process.on("beforeExit", () => {
    shutdown("normal_termination");
  });
}

export async function startMcpServer(server: FastMCP): Promise<void> {
  const transport = getConfiguredString("OPENFGA_MCP_TRANSPORT", "stdio");
  if (transport === "http") {
    await server.start({
      transportType: "httpStream",
      httpStream: {
        host: getConfiguredString("OPENFGA_MCP_TRANSPORT_HOST", "127.0.0.1"),
        port: getConfiguredInt("OPENFGA_MCP_TRANSPORT_PORT", 9090),
        enableJsonResponse: !getConfiguredBool("OPENFGA_MCP_TRANSPORT_SSE", true),
        stateless: getConfiguredBool("OPENFGA_MCP_TRANSPORT_STATELESS", false),
      },
    });
  } else {
    if (isDebugEnabled()) {
      process.stderr.write("[MCP DEBUG] Stdio transport debug logging enabled via FastMCP logger\n");
    }
    await server.start({ transportType: "stdio" });
  }
}
