import { createServer as createNetServer } from "node:net";
import type { FastMCP } from "fastmcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { createServerContext, disposeServerContext, type ServerContext } from "../../../src/client.js";
import { applyRuntimeConfigToEnv, type RuntimeConfig } from "../../../src/runtime-config.js";
import {
  createMcpServer,
  initializeDocumentationWithLogging,
  registerMcpCapabilities,
  startMcpServer,
} from "../../../src/server.js";

export type TestMcpServer = {
  baseUrl: string;
  port: number;
  ctx: ServerContext;
  server: FastMCP;
};

export async function getFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function startTestMcpServer(options: {
  authApiUrl: string;
  port?: number;
}): Promise<TestMcpServer> {
  const port = options.port ?? (await getFreePort());
  const publicUrl = `http://127.0.0.1:${port}`;

  const runtime: RuntimeConfig = {
    transport: "http",
    host: "127.0.0.1",
    port,
    publicUrl,
    sse: false,
    stateless: false,
    debug: false,
  };

  applyRuntimeConfigToEnv(runtime);
  process.env.OPENFGA_MCP_CONFIG = JSON.stringify({
    allow_dynamic_connections: true,
    defaults: { writeable: true },
  });

  const ctx = await createServerContext(undefined, runtime);
  initializeDocumentationWithLogging();

  const server = createMcpServer();
  registerMcpCapabilities(server, ctx);
  await startMcpServer(server);

  return { baseUrl: publicUrl, port, ctx, server };
}

export async function stopTestMcpServer(testServer: TestMcpServer): Promise<void> {
  await testServer.server.stop();
  disposeServerContext(testServer.ctx);
}

export async function createMcpTestClient(
  baseUrl: string,
  capabilities: ClientCapabilities = {},
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client(
    { name: "fga-mcp-integration-test", version: "1.0.0" },
    { capabilities },
  );
  await client.connect(transport);
  return { client, transport };
}

export async function closeMcpTestClient(client: Client): Promise<void> {
  await client.close();
}

export function parseToolJsonText(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  const block = result.content?.find((item) => item.type === "text");
  if (!block?.text) {
    throw new Error("Expected text content in tool result");
  }
  return JSON.parse(block.text);
}

export async function completeAuthForm(elicitationUrl: string, token: string): Promise<void> {
  const formPage = await fetch(elicitationUrl);
  if (!formPage.ok) {
    throw new Error(`GET auth form failed: HTTP ${formPage.status}`);
  }
  const html = await formPage.text();
  const csrfMatch = html.match(/name="csrf" value="([^"]+)"/);
  if (!csrfMatch?.[1]) {
    throw new Error("CSRF token not found in auth form");
  }

  const post = await fetch(elicitationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrf: csrfMatch[1],
      method: "api_token",
      token,
    }).toString(),
  });
  if (!post.ok) {
    throw new Error(`POST auth form failed: HTTP ${post.status}`);
  }
}
