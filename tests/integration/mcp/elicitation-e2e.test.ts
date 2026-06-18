import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ErrorCode,
  McpError,
  UrlElicitationRequiredError,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { PendingElicitationStore } from "../../../src/elicitation/pending-store.js";
import {
  closeMcpTestClient,
  completeAuthForm,
  createMcpTestClient,
  parseToolJsonText,
  startTestMcpServer,
  stopTestMcpServer,
  type TestMcpServer,
} from "../helpers/mcp-test-server.js";
import { getTestAuthApiUrl, getTestAuthPresharedKey } from "../helpers.js";

const authTestsEnabled = Boolean(process.env.OPENFGA_AUTH_API_URL);

describe.skipIf(!authTestsEnabled)("MCP auth elicitation E2E", () => {
  let testServer: TestMcpServer;
  const authApiUrl = getTestAuthApiUrl();
  const authKey = getTestAuthPresharedKey();

  beforeAll(async () => {
    testServer = await startTestMcpServer({ authApiUrl });
  }, 120_000);

  afterAll(async () => {
    if (testServer) {
      await stopTestMcpServer(testServer);
    }
  });

  beforeEach(() => {
    testServer.ctx.pendingElicitations = new PendingElicitationStore();
  });

  it("Path A: connect_server returns -32042 when client declares elicitation.url", async () => {
    const { client } = await createMcpTestClient(testServer.baseUrl, {
      elicitation: { url: {} },
    });

    try {
      let elicitationUrl = "";
      try {
        await client.callTool({
          name: "connect_server",
          arguments: { api_url: authApiUrl, requested_name: "path-a" },
        });
        throw new Error("Expected UrlElicitationRequiredError");
      } catch (error) {
        if (
          error instanceof UrlElicitationRequiredError ||
          (error instanceof McpError && error.code === ErrorCode.UrlElicitationRequired)
        ) {
          expect(error.code).toBe(ErrorCode.UrlElicitationRequired);
          const elicitations =
            error instanceof UrlElicitationRequiredError
              ? error.elicitations
              : ((error as McpError).data as { elicitations?: Array<{ url?: string }> } | undefined)
                  ?.elicitations;
          elicitationUrl = elicitations?.[0]?.url ?? "";
          expect(elicitationUrl).toContain("/auth/elicit/");
        } else {
          throw error;
        }
      }

      await completeAuthForm(elicitationUrl, authKey);

      const connected = (await client.callTool({
        name: "connect_server",
        arguments: { api_url: authApiUrl, requested_name: "path-a" },
      })) as CallToolResult;

      expect(connected.isError).toBeFalsy();
      const payload = parseToolJsonText(connected) as { server: string };
      expect(payload.server).toBe("path-a");
    } finally {
      await closeMcpTestClient(client);
    }
  });

  it("Path B: connect_server returns UserError structuredContent without url elicitation capability", async () => {
    const { client } = await createMcpTestClient(testServer.baseUrl);

    try {
      const result = (await client.callTool({
        name: "connect_server",
        arguments: { api_url: authApiUrl, requested_name: "path-b" },
      })) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        elicitation_required: true,
        url: expect.stringContaining("/auth/elicit/"),
        reason: "connect",
      });

      const elicitationUrl = String((result.structuredContent as { url: string }).url);
      await completeAuthForm(elicitationUrl, authKey);

      const connected = (await client.callTool({
        name: "connect_server",
        arguments: { api_url: authApiUrl, requested_name: "path-b" },
      })) as CallToolResult;

      expect(connected.isError).toBeFalsy();
      const payload = parseToolJsonText(connected) as {
        connection_scope: string;
        server: string;
      };
      expect(payload.server).toBe("path-b");
      expect(payload.connection_scope).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const stores = (await client.callTool({
        name: "list_stores",
        arguments: {
          connection_scope: payload.connection_scope,
          server: payload.server,
        },
      })) as CallToolResult;

      expect(stores.isError).toBeFalsy();
      expect(parseToolJsonText(stores)).toEqual(expect.any(Array));
    } finally {
      await closeMcpTestClient(client);
    }
  });
});
