import { describe, expect, it, vi } from "vitest";
import * as serverManagement from "../../src/tools/handlers/server-management.js";
import { createDynamicContext, createMockContext, createMultiServerContext, createOfflineContext } from "../helpers/mock-client.js";
import { setOnlineWritableMode } from "../helpers/env.js";

vi.mock("../../src/auth-probe.js", () => ({
  probeOpenFgaAuth: vi.fn(async () => ({ status: "open" })),
  validateOpenFgaAuth: vi.fn(async () => true),
}));

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

describe("server management tools", () => {
  it("lists fixed servers with dynamic_connections_enabled false", async () => {
    setOnlineWritableMode();
    const ctx = createMultiServerContext(
      {
        dev: { listStores: vi.fn() },
        prod: { listStores: vi.fn() },
      },
      { defaultServer: "dev" },
    );

    const result = await serverManagement.listServers(ctx);
    expect(result).toEqual({
      dynamic_connections_enabled: false,
      servers: expect.arrayContaining([
        expect.objectContaining({ name: "dev", default: true, fixed: true }),
        expect.objectContaining({ name: "prod", default: false, fixed: true }),
      ]),
    });
  });

  it("lists empty fixed servers with dynamic_connections_enabled when dynamic-only", async () => {
    const ctx = createDynamicContext();
    const result = await serverManagement.listServers(ctx);
    expect(result).toEqual({
      dynamic_connections_enabled: true,
      servers: [],
    });
  });

  it("sets default server", async () => {
    setOnlineWritableMode();
    const ctx = createMultiServerContext(
      { dev: {}, prod: {} },
      { defaultServer: "dev" },
    );

    const result = await serverManagement.setDefaultServerTool(ctx, "prod");
    expect(result).toBe('✅ Default server set to "prod".');
    expect(ctx.pool?.defaultServer).toBe("prod");
  });

  it("blocks list in offline mode", async () => {
    const result = await serverManagement.listServers(createOfflineContext());
    expect(result).toContain("requires a live OpenFGA instance");
  });

  it("returns error for unknown default server", async () => {
    setOnlineWritableMode();
    const ctx = createMockContext({});
    const result = await serverManagement.setDefaultServerTool(ctx, "missing");
    expect(result).toContain('Unknown server "missing"');
  });

  it("connects dynamic server when runtime connect is enabled", async () => {
    const ctx = createDynamicContext();
    const result = await serverManagement.connectServer(ctx, {
      api_url: "http://127.0.0.1:8080",
      requested_name: "dev",
    });
    expect(result).toMatchObject({
      server: "dev",
      renamed: false,
      connected: true,
      api_url: "http://127.0.0.1:8080",
    });
  });

  it("rejects connect when runtime connect is disabled", async () => {
    const ctx = createDynamicContext({ allowDynamicConnect: false, fixedClients: { dev: {} } });
    ctx.dynamicStore = null;
    await expect(serverManagement.connectServer(ctx, { api_url: "http://127.0.0.1:8080" })).rejects.toThrow(
      "Dynamic connections are disabled",
    );
  });

  it("lists fixed and dynamic servers when connection_scope is passed", async () => {
    const ctx = createDynamicContext({ fixedClients: { dev: {} } });
    const connected = await serverManagement.connectServer(ctx, {
      api_url: "http://127.0.0.1:9090",
      requested_name: "staging",
    });
    if (typeof connected === "string") throw new Error(connected);

    const result = await serverManagement.listServers(ctx, connected.connection_scope as string);
    expect(result).toMatchObject({
      dynamic_connections_enabled: true,
      connection_scope: connected.connection_scope,
      servers: [
        expect.objectContaining({ name: "staging", fixed: false, default: true, connected: true }),
      ],
    });
    const servers = (result as { servers: Array<{ fixed: boolean }> }).servers;
    expect(servers).toHaveLength(1);
  });

  it("lists dynamic-only servers in scope when no fixed pool", async () => {
    const ctx = createDynamicContext();
    const connected = await serverManagement.connectServer(ctx, {
      api_url: "http://127.0.0.1:8080",
      requested_name: "dev",
    });
    if (typeof connected === "string") throw new Error(connected);
    const result = await serverManagement.listServers(ctx, connected.connection_scope as string);
    expect(result).toMatchObject({
      dynamic_connections_enabled: true,
      connection_scope: connected.connection_scope,
      servers: [expect.objectContaining({ name: "dev", fixed: false, default: true })],
    });
  });

  it("disconnects dynamic server and drops empty scope", async () => {
    const ctx = createDynamicContext();
    const connected = await serverManagement.connectServer(ctx, {
      api_url: "http://127.0.0.1:8080",
      requested_name: "dev",
    });
    if (typeof connected === "string") throw new Error(connected);
    const result = await serverManagement.disconnectServer(ctx, connected.connection_scope as string, "dev");
    expect(result).toContain("✅ Disconnected");
    expect(ctx.dynamicStore?.getScopeCount()).toBe(0);
  });
});
