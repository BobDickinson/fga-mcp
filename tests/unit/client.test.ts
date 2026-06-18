import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createServerContext,
  defaultClient,
  legacyEnvHasCredentials,
  requireClient,
  requirePool,
} from "../../src/client.js";
import { isOfflineMode } from "../../src/config.js";
import * as modelHandlers from "../../src/tools/handlers/model.js";
import * as relationshipHandlers from "../../src/tools/handlers/relationship.js";
import * as storeHandlers from "../../src/tools/handlers/store.js";
import { createMockContext, createMultiServerContext, createOfflineContext } from "../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";

const VALID_DSL = `model
  schema 1.1
type user
type document
  relations
    define viewer: [user]`;

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("createServerContext", () => {
  it("returns offline context when no credentials configured", async () => {
    clearOpenFgaEnv();
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(true);
    expect(ctx.pool).toBeNull();
  });

  it("returns online context when API URL is configured", async () => {
    setEnv("OPENFGA_MCP_API_URL", "http://127.0.0.1:59999");
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(false);
    expect(ctx.pool?.servers.has("default")).toBe(true);
  });

  it("returns online context when only an API token is configured", async () => {
    setEnv("OPENFGA_MCP_API_TOKEN", "test-token");
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(false);
    expect(ctx.pool?.servers.size).toBe(1);
    expect(ctx.pool?.defaultServer).toBe("default");
  });

  it("returns online context when only client credentials are configured", async () => {
    setEnv("OPENFGA_MCP_API_CLIENT_ID", "client-id");
    setEnv("OPENFGA_MCP_API_CLIENT_SECRET", "client-secret");
    setEnv("OPENFGA_MCP_API_ISSUER", "https://issuer.example.com");
    setEnv("OPENFGA_MCP_API_AUDIENCE", "https://api.example.com");
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(false);
    expect(ctx.pool?.servers.size).toBe(1);
  });

  it("returns online dynamic-only context when runtime connect is enabled", async () => {
    setEnv(
      "OPENFGA_MCP_CONFIG",
      JSON.stringify({
        allow_dynamic_connections: true,
        dynamic: { max_scopes: 5 },
      }),
    );
    const ctx = await createServerContext(undefined, { transport: "http" });
    expect(ctx.offline).toBe(false);
    expect(ctx.pool).toBeNull();
    expect(ctx.dynamicStore).not.toBeNull();
    expect(ctx.transport).toBe("http");
  });

  it("throws when FGA config is invalid", async () => {
    setEnv(
      "OPENFGA_MCP_CONFIG",
      JSON.stringify({
        servers: { prod: { api_url: "http://127.0.0.1:8080", restrict: true } },
      }),
    );
    await expect(createServerContext()).rejects.toThrow(/restrict requires/);
  });
});

describe("requirePool", () => {
  it("returns pool when online", () => {
    const ctx = createMockContext({});
    expect(requirePool(ctx).servers.size).toBe(1);
  });

  it("throws in offline mode", () => {
    expect(() => requirePool(createOfflineContext())).toThrow("OpenFGA fixed server pool is not available");
  });
});

describe("requireClient", () => {
  it("throws in offline mode", () => {
    expect(() => requireClient(createOfflineContext())).toThrow(/OpenFGA server pool is not available/);
  });

  it("provides a helpful error message referencing offline pool", () => {
    expect(() => requireClient(createOfflineContext())).toThrow(/Configure fixed servers or use connect_server/);
  });

  it("resolves the default server client", () => {
    const dev = { listStores: vi.fn() };
    const prod = { listStores: vi.fn() };
    const ctx = createMultiServerContext({ dev, prod }, { defaultServer: "dev" });
    expect(requireClient(ctx)).toBe(dev);
  });

  it("resolves a named server client", () => {
    const dev = { listStores: vi.fn() };
    const prod = { listStores: vi.fn() };
    const ctx = createMultiServerContext({ dev, prod }, { defaultServer: "dev" });
    expect(requireClient(ctx, { server: "prod" })).toBe(prod);
  });
});

describe("defaultClient", () => {
  it("returns null in offline mode", () => {
    expect(defaultClient(createOfflineContext())).toBeNull();
  });

  it("returns the default server client when pool exists", () => {
    const client = { listStores: vi.fn() };
    expect(defaultClient(createMockContext(client))).toBe(client);
  });
});

describe("legacyEnvHasCredentials", () => {
  it("returns false when no legacy env is set", () => {
    clearOpenFgaEnv();
    expect(legacyEnvHasCredentials()).toBe(false);
  });

  it("returns true when API URL, token, or client ID is set", () => {
    setEnv("OPENFGA_MCP_API_URL", "http://127.0.0.1:8080");
    expect(legacyEnvHasCredentials()).toBe(true);

    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_TOKEN", "token");
    expect(legacyEnvHasCredentials()).toBe(true);

    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_CLIENT_ID", "client");
    expect(legacyEnvHasCredentials()).toBe(true);
  });
});

describe("offline mode behavior", () => {
  const offlineCtx = createOfflineContext();

  beforeEach(() => {
    clearOpenFgaEnv();
    expect(isOfflineMode()).toBe(true);
  });

  describe("read operations", () => {
    it("blocks getStore", async () => {
      const result = await storeHandlers.getStore(offlineCtx, "store-id");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks listStores", async () => {
      const result = await storeHandlers.listStores(offlineCtx);
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks checkPermission", async () => {
      const result = await relationshipHandlers.checkPermission(
        offlineCtx,
        "store-id",
        "model-id",
        "user:1",
        "viewer",
        "document:1",
      );
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks getAuthorizationModel", async () => {
      const result = await modelHandlers.getModel(offlineCtx, "store-id", "model-id");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks listModels", async () => {
      const result = await modelHandlers.listModels(offlineCtx, "store-id");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("allows verifyModel locally without a live server", async () => {
      const result = await modelHandlers.verifyModel(offlineCtx, VALID_DSL);
      expect(result).toContain("✅ Successfully verified");
    });
  });

  describe("write operations", () => {
    it("blocks createStore with helpful message", async () => {
      const result = await storeHandlers.createStore(offlineCtx, "Test Store");
      expect(result).toContain("OpenFGA instance");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks deleteStore", async () => {
      const result = await storeHandlers.deleteStore(offlineCtx, "store-id");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks createModel", async () => {
      const result = await modelHandlers.createModel(offlineCtx, VALID_DSL, "store-id");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks grantPermission", async () => {
      const result = await relationshipHandlers.grantPermission(
        offlineCtx,
        "store-id",
        "model-id",
        "user:1",
        "viewer",
        "document:1",
      );
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });

    it("blocks revokePermission", async () => {
      const result = await relationshipHandlers.revokePermission(
        offlineCtx,
        "store-id",
        "model-id",
        "user:1",
        "viewer",
        "document:1",
      );
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });
  });

  describe("parameter handling", () => {
    it("handles various store identifiers consistently", async () => {
      const result = await storeHandlers.getStore(offlineCtx, "store-123");
      expect(typeof result).toBe("string");
      expect(result).toContain("OPENFGA_MCP_API_URL");
    });
  });
});
