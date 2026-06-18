import { describe, expect, it, vi } from "vitest";
import { probeOpenFgaAuth } from "../../src/auth-probe.js";
import { PendingElicitationStore } from "../../src/elicitation/pending-store.js";
import { requestUrlElicitation, stdioElicitationUnavailableMessage } from "../../src/elicitation/request-url-elicitation.js";
import { UserError } from "fastmcp";
import { UrlElicitationRequiredError } from "@modelcontextprotocol/sdk/types.js";
import { createDynamicContext } from "../helpers/mock-client.js";
import { registerElicitationSession, clearElicitationSessions } from "../../src/elicitation/session-registry.js";

describe("auth probe", () => {
  it("detects open FGA on 200", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ stores: [] }), { status: 200 }));
    const result = await probeOpenFgaAuth("http://example.com", fetchImpl as typeof fetch);
    expect(result).toEqual({ status: "open" });
  });

  it("detects auth required on 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const result = await probeOpenFgaAuth("http://example.com", fetchImpl as typeof fetch);
    expect(result).toEqual({ status: "auth_required" });
  });
});

describe("pending elicitation store", () => {
  it("matches completed connect by api_url", () => {
    const store = new PendingElicitationStore();
    const pending = store.create({
      reason: "connect",
      connectMode: "api_url",
      apiUrl: "http://127.0.0.1:8080",
    });
    store.complete(pending.elicitationId, { method: "api_token", token: "secret" });
    const matched = store.findCompletedForConnect({
      connectMode: "api_url",
      apiUrl: "http://127.0.0.1:8080",
    });
    expect(matched?.auth).toEqual({ method: "api_token", token: "secret" });
  });
});

describe("requestUrlElicitation", () => {
  it("throws UserError structured fallback when URL capability absent", () => {
    const ctx = createDynamicContext({ transport: "http" });
    const pendingStore = ctx.pendingElicitations;

    try {
      requestUrlElicitation({
        ctx,
        pendingStore,
        reason: "connect",
        connectMode: "api_url",
        apiUrl: "http://127.0.0.1:8080",
        message: "Authenticate",
        toolCtx: { sessionId: "sess-1" },
      });
      throw new Error("Expected UserError");
    } catch (error) {
      expect(error).toBeInstanceOf(UserError);
      expect((error as UserError).message).toContain("/auth/elicit/");
      expect((error as UserError).message).toContain("Open this URL in your browser");
    }
  });

  it("throws UrlElicitationRequiredError when URL capability present", () => {
    clearElicitationSessions();
    registerElicitationSession("sess-2", {
      clientCapabilities: { elicitation: { url: {} } },
      mcpServer: {} as never,
    });
    const ctx = createDynamicContext({ transport: "http" });
    expect(() =>
      requestUrlElicitation({
        ctx,
        pendingStore: ctx.pendingElicitations,
        reason: "connect",
        connectMode: "api_url",
        apiUrl: "http://127.0.0.1:8080",
        message: "Authenticate",
        toolCtx: { sessionId: "sess-2" },
      }),
    ).toThrow(UrlElicitationRequiredError);
  });

  it("returns stdio unavailable message", () => {
    expect(stdioElicitationUnavailableMessage("prod")).toContain("stdio transport");
  });
});
