import { describe, expect, it, vi } from "vitest";
import * as serverManagement from "../../src/tools/handlers/server-management.js";
import { createMockContext, createMultiServerContext, createOfflineContext } from "../helpers/mock-client.js";
import { setOnlineWritableMode } from "../helpers/env.js";

describe("server management tools", () => {
  it("lists fixed servers", async () => {
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
      servers: expect.arrayContaining([
        expect.objectContaining({ name: "dev", default: true, fixed: true }),
        expect.objectContaining({ name: "prod", default: false, fixed: true }),
      ]),
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
});
