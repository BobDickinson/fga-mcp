import { describe, expect, it, vi } from "vitest";
import type { OpenFgaClient } from "@openfga/sdk";
import {
  createTestPool,
  listFixedServers,
  resolveClient,
  resolveModelId,
  resolveServerPolicy,
  resolveServerRef,
  resolveStoreId,
  setDefaultServer,
} from "../../src/server-pool.js";

function mockClient(label: string): OpenFgaClient {
  return { listStores: vi.fn().mockResolvedValue({ stores: [] }), label } as unknown as OpenFgaClient;
}

describe("server pool resolution", () => {
  const pool = createTestPool(
    { dev: mockClient("dev"), prod: mockClient("prod") },
    {
      defaultServer: "dev",
      profiles: {
        dev: { api_url: "http://dev:8080", default_store: "dev-store", writeable: true },
        prod: {
          api_url: "http://prod:8080",
          default_store: "prod-store",
          default_model: "prod-model",
          restrict: true,
          writeable: false,
        },
      },
    },
  );

  it("resolves default server client", () => {
    const client = resolveClient(pool);
    expect((client as unknown as { label: string }).label).toBe("dev");
  });

  it("resolves named server client", () => {
    const client = resolveClient(pool, { server: "prod" });
    expect((client as unknown as { label: string }).label).toBe("prod");
  });

  it("throws for unknown server", () => {
    expect(() => resolveClient(pool, { server: "missing" })).toThrow('Unknown server "missing"');
  });

  it("throws when connection_scope is passed", () => {
    expect(() => resolveClient(pool, { connectionScope: "scope-1" })).toThrow("connection_scope is not supported");
  });

  it("inherits per-server policy with global defaults", () => {
    const devPolicy = resolveServerPolicy(pool, "dev");
    expect(devPolicy).toMatchObject({ defaultStore: "dev-store", writeable: true, restrict: false });

    const prodPolicy = resolveServerPolicy(pool, "prod");
    expect(prodPolicy).toMatchObject({
      defaultStore: "prod-store",
      defaultModel: "prod-model",
      restrict: true,
      writeable: false,
    });
  });

  it("resolves store and model ids", () => {
    const policy = resolveServerPolicy(pool, "prod");
    expect(resolveStoreId(undefined, policy)).toBe("prod-store");
    expect(resolveStoreId("explicit", policy)).toBe("explicit");
    expect(resolveModelId(undefined, policy)).toBe("prod-model");
    expect(resolveModelId(undefined, resolveServerPolicy(pool, "dev"))).toBe("latest");
  });

  it("lists fixed servers with default marker", () => {
    const servers = listFixedServers(pool);
    expect(servers).toHaveLength(2);
    expect(servers.find((s) => s.name === "dev")?.default).toBe(true);
    expect(servers.find((s) => s.name === "prod")?.restrict).toBe(true);
  });

  it("updates default server", () => {
    setDefaultServer(pool, "prod");
    expect(resolveServerRef(pool)).toBe("prod");
    expect(listFixedServers(pool).find((s) => s.name === "prod")?.default).toBe(true);
  });
});
