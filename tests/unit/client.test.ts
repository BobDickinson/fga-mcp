import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerContext, requireClient } from "../../src/client.js";
import { isOfflineMode } from "../../src/config.js";
import * as modelHandlers from "../../src/tools/handlers/model.js";
import * as relationshipHandlers from "../../src/tools/handlers/relationship.js";
import * as storeHandlers from "../../src/tools/handlers/store.js";
import { createOfflineContext } from "../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("createServerContext", () => {
  it("returns offline context when no credentials configured", async () => {
    clearOpenFgaEnv();
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(true);
    expect(ctx.client).toBeNull();
  });

  it("returns online context when API URL is configured", async () => {
    setEnv("OPENFGA_MCP_API_URL", "http://127.0.0.1:59999");
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(false);
    expect(ctx.client).not.toBeNull();
  });

  it("returns online context when only an API token is configured", async () => {
    setEnv("OPENFGA_MCP_API_TOKEN", "test-token");
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(false);
    expect(ctx.client).not.toBeNull();
  });

  it("returns online context when only client credentials are configured", async () => {
    setEnv("OPENFGA_MCP_API_CLIENT_ID", "client-id");
    setEnv("OPENFGA_MCP_API_CLIENT_SECRET", "client-secret");
    setEnv("OPENFGA_MCP_API_ISSUER", "https://issuer.example.com");
    setEnv("OPENFGA_MCP_API_AUDIENCE", "https://api.example.com");
    const ctx = await createServerContext();
    expect(ctx.offline).toBe(false);
    expect(ctx.client).not.toBeNull();
  });
});

describe("requireClient", () => {
  it("throws in offline mode", () => {
    expect(() => requireClient({ client: null, offline: true })).toThrow("offline mode");
  });

  it("provides a helpful error message referencing OPENFGA_MCP_API_URL", () => {
    expect(() => requireClient(createOfflineContext())).toThrow(/OpenFGA client is not available in offline mode/);
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

    it("blocks verifyModel", async () => {
      const result = await modelHandlers.verifyModel(
        offlineCtx,
        `model
  schema 1.1
type user
type document
  relations
    define viewer: [user]`,
      );
      expect(result).toContain("OPENFGA_MCP_API_URL");
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
      const result = await modelHandlers.createModel(offlineCtx, "model\n  schema 1.1\ntype user", "store-id");
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
