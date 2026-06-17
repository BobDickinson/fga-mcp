import { describe, expect, it, vi } from "vitest";
import type { OpenFgaClient } from "@openfga/sdk";
import { resolveConnection } from "../../src/connection-resolver.js";
import { createDynamicContext, createMultiServerContext } from "../helpers/mock-client.js";

vi.mock("../../src/server-pool.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/server-pool.js")>();
  return {
    ...original,
    createOpenFgaClientForServer: vi.fn(async (server) => ({
      listStores: vi.fn().mockResolvedValue({ stores: [] }),
      label: server.name ?? server.api_url,
    })),
  };
});

describe("resolveConnection", () => {
  it("resolves fixed pool when no scope is provided", () => {
    const dev = { label: "dev" } as OpenFgaClient;
    const ctx = createMultiServerContext({ dev, prod: { label: "prod" } }, { defaultServer: "dev" });
    const resolved = resolveConnection(ctx, { server: "prod" });
    expect(resolved.dynamic).toBe(false);
    expect(resolved.serverRef).toBe("prod");
  });

  it("resolves dynamic pool with explicit scope", async () => {
    const ctx = createDynamicContext({ transport: "http" });
    const connected = await ctx.dynamicStore!.connectServer({ apiUrl: "http://127.0.0.1:8080", requestedName: "dyn" });
    const resolved = resolveConnection(ctx, { connectionScope: connected.connectionScope, server: "dyn" });
    expect(resolved.dynamic).toBe(true);
    expect(resolved.connectionScope).toBe(connected.connectionScope);
  });

  it("uses stdio implicit scope for dynamic server names", async () => {
    const ctx = createDynamicContext({ transport: "stdio" });
    const connected = await ctx.dynamicStore!.connectServer({ apiUrl: "http://127.0.0.1:8080", requestedName: "dyn" });
    const resolved = resolveConnection(ctx, { server: connected.server });
    expect(resolved.dynamic).toBe(true);
    expect(resolved.serverRef).toBe("dyn");
  });

  it("requires scope on http when server exists only in dynamic pool", async () => {
    const ctx = createDynamicContext({ transport: "http", fixedClients: { dev: { label: "dev" } } });
    const connected = await ctx.dynamicStore!.connectServer({ apiUrl: "http://127.0.0.1:9090", requestedName: "dyn" });
    expect(() => resolveConnection(ctx, { server: connected.server })).toThrow(/connection_scope is required/);
  });
});
