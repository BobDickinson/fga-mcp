#!/usr/bin/env node
import { createServerContext } from "./client.js";
import { applyRuntimeConfigToEnv, loadRuntimeConfig } from "./runtime-config.js";
import { getConfiguredBool } from "./config.js";
import { logServerLifecycle } from "./debug-logger.js";
import {
  createMcpServer,
  initializeDocumentationWithLogging,
  logStartup,
  registerMcpCapabilities,
  registerProcessLifecycleHandlers,
  startMcpServer,
} from "./server.js";

async function main(): Promise<void> {
  const runtimeConfig = loadRuntimeConfig(process.argv.slice(2));
  applyRuntimeConfigToEnv(runtimeConfig);

  const ctx = await createServerContext(runtimeConfig.configPath);

  if (getConfiguredBool("OPENFGA_MCP_DEBUG", true)) {
    registerProcessLifecycleHandlers();
  }

  initializeDocumentationWithLogging();

  const server = createMcpServer();
  registerMcpCapabilities(server, ctx);
  logStartup(ctx);

  await startMcpServer(server);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[CRITICAL ERROR] ${message}\n`);
  logServerLifecycle("critical_error", {
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
