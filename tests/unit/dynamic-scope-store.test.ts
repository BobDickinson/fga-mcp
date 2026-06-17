import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenFgaClient } from "@openfga/sdk";
import {
  DynamicScopeStore,
  assignServerName,
  deriveServerNameFromUrl,
} from "../../src/dynamic-scope-store.js";

vi.mock("../../src/server-pool.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/server-pool.js")>();
  return {
    ...original,
    createOpenFgaClientForServer: vi.fn(async (server) => ({
      listStores: vi.fn().mockResolvedValue({ stores: [] }),
      apiUrl: server.api_url,
      label: server.name,
    })),
  };
});

function createStore(transport: "stdio" | "http" = "stdio", overrides: Partial<DynamicScopeStore["config"]> = {}) {
  return new DynamicScopeStore({
    transport,
    globalDefaults: { writeable: false },
    config: {
      scopeIdleTtlSeconds: 3600,
      maxServersPerScope: 3,
      maxScopes: 2,
      ...overrides,
    },
  });
}

describe("deriveServerNameFromUrl", () => {
  it("derives host-based names", () => {
    expect(deriveServerNameFromUrl("http://staging.example:8080")).toBe("staging-example");
    expect(deriveServerNameFromUrl("http://127.0.0.1:8080")).toBe("local-8080");
  });
});

describe("assignServerName", () => {
  it("suffixes on collision", () => {
    const registry = {
      scopeId: "s1",
      servers: new Map([["dev", { client: {} as OpenFgaClient, profile: { name: "dev", api_url: "http://a" } }]]),
      defaultServer: "dev",
      createdAt: 0,
      lastUsedAt: 0,
    };
    const result = assignServerName(registry, "dev", "http://b");
    expect(result.name).toBe("dev-1");
    expect(result.renamed).toBe(true);
  });
});

describe("DynamicScopeStore", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mints scope and connects server with requested name", async () => {
    const store = createStore();
    const result = await store.connectServer({
      apiUrl: "http://127.0.0.1:8080",
      requestedName: "dev",
    });

    expect(result.connectionScope).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.server).toBe("dev");
    expect(result.renamed).toBe(false);
    expect(store.getScopeCount()).toBe(1);
  });

  it("upserts by api_url within scope", async () => {
    const store = createStore();
    const first = await store.connectServer({ apiUrl: "http://127.0.0.1:8080", requestedName: "dev" });
    const second = await store.connectServer({
      connectionScope: first.connectionScope,
      apiUrl: "http://127.0.0.1:8080",
      requestedName: "other",
    });

    expect(second.server).toBe("dev");
    expect(second.renamed).toBe(false);
    expect(store.listServers(first.connectionScope)).toHaveLength(1);
  });

  it("drops scope when last server disconnects", async () => {
    const store = createStore();
    const connected = await store.connectServer({ apiUrl: "http://127.0.0.1:8080", requestedName: "dev" });
    store.disconnectServer(connected.connectionScope, connected.server);
    expect(store.getScopeCount()).toBe(0);
  });

  it("enforces stdio single scope count", async () => {
    const store = createStore("stdio");
    await store.connectServer({ apiUrl: "http://127.0.0.1:8080" });
    expect(() => store.mintScope()).toThrow(/At most one dynamic/);
  });

  it("reuses the sole stdio scope when connecting without connection_scope", async () => {
    const store = createStore("stdio");
    const first = await store.connectServer({ apiUrl: "http://127.0.0.1:8080", requestedName: "a" });
    const second = await store.connectServer({ apiUrl: "http://127.0.0.1:8081", requestedName: "b" });
    expect(second.connectionScope).toBe(first.connectionScope);
    expect(store.getScopeCount()).toBe(1);
    expect(store.listServers(first.connectionScope)).toHaveLength(2);
  });

  it("enforces max servers per scope", async () => {
    const store = createStore("http", { maxServersPerScope: 1 });
    const connected = await store.connectServer({ apiUrl: "http://127.0.0.1:8080" });
    await expect(
      store.connectServer({ connectionScope: connected.connectionScope, apiUrl: "http://127.0.0.1:8081" }),
    ).rejects.toThrow(/Maximum servers per connection scope/);
  });

  it("evicts idle scopes on http", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const store = createStore("http", { scopeIdleTtlSeconds: 60 });
    const connected = await store.connectServer({ apiUrl: "http://127.0.0.1:8080" });
    now.mockReturnValue(1_000 + 120_000);
    const evicted = store.evictIdleScopes();
    expect(evicted).toContain(connected.connectionScope);
    expect(store.getScopeCount()).toBe(0);
    now.mockRestore();
  });

  it("sets default server within scope", async () => {
    const store = createStore();
    const connected = await store.connectServer({ apiUrl: "http://127.0.0.1:8080", requestedName: "a" });
    await store.connectServer({ connectionScope: connected.connectionScope, apiUrl: "http://127.0.0.1:8081", requestedName: "b" });
    store.setDefaultServer(connected.connectionScope, "b");
    expect(store.resolveServerRef(connected.connectionScope)).toBe("b");
  });
});
