import { describe, expect, it, vi } from "vitest";
import type { OpenFgaClient } from "@openfga/sdk";
import {
  buildCredentialsFromAuth,
  createTestPool,
  listFixedServers,
  resolveClient,
  resolveModelId,
  resolveServerPolicy,
  resolveServerRef,
  resolveStoreId,
  setDefaultServer,
} from "../../src/server-pool.js";
import { CredentialsMethod } from "@openfga/sdk";

function mockClient(label: string): OpenFgaClient {
  return { listStores: vi.fn().mockResolvedValue({ stores: [] }), label } as unknown as OpenFgaClient;
}

describe("buildCredentialsFromAuth", () => {
  it("maps api_token auth to SDK ApiToken credentials", () => {
    expect(buildCredentialsFromAuth({ method: "api_token", token: "secret" })).toEqual({
      method: CredentialsMethod.ApiToken,
      config: { token: "secret", headerName: "Authorization", headerValuePrefix: "Bearer" },
    });
  });

  it("maps client_credentials auth to SDK ClientCredentials", () => {
    expect(
      buildCredentialsFromAuth({
        method: "client_credentials",
        client_id: "id",
        client_secret: "secret",
        issuer: "https://issuer.example",
        audience: "https://api.example/",
        scopes: "read:tuples write:tuples",
      }),
    ).toEqual({
      method: CredentialsMethod.ClientCredentials,
      config: {
        clientId: "id",
        clientSecret: "secret",
        apiTokenIssuer: "https://issuer.example",
        apiAudience: "https://api.example/",
        scopes: ["read:tuples", "write:tuples"],
      },
    });
  });

  it("returns undefined when auth is omitted", () => {
    expect(buildCredentialsFromAuth(undefined)).toBeUndefined();
  });
});

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

  it("throws when connection_scope is passed to fixed resolveClient", () => {
    expect(() => resolveClient(pool, { connectionScope: "scope-1" })).toThrow("connection_scope requires ServerContext");
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
