import { afterEach, describe, expect, it } from "vitest";
import { UserError } from "fastmcp";
import { probeOpenFgaAuth, validateOpenFgaAuth } from "../../../src/auth-probe.js";
import * as serverManagement from "../../../src/tools/handlers/server-management.js";
import * as storeHandlers from "../../../src/tools/handlers/store.js";
import { createDynamicContext } from "../../helpers/mock-client.js";
import {
  getTestAuthApiUrl,
  getTestAuthPresharedKey,
  requireConnectResult,
  restoreIntegrationEnv,
} from "../helpers.js";

afterEach(() => {
  restoreIntegrationEnv();
});

const authApiUrl = () => getTestAuthApiUrl();
const authKey = () => getTestAuthPresharedKey();
const authTestsEnabled = Boolean(process.env.OPENFGA_AUTH_API_URL);

describe.skipIf(!authTestsEnabled)("Auth-enabled OpenFGA connect elicitation", () => {
  it("probes auth_required on unauthenticated ListStores", async () => {
    const result = await probeOpenFgaAuth(authApiUrl());
    expect(result).toEqual({ status: "auth_required" });
  });

  it("validates preshared credentials", async () => {
    const valid = await validateOpenFgaAuth(authApiUrl(), { method: "api_token", token: authKey() });
    expect(valid).toBe(true);
  });

  it("returns stdio elicitation unavailable when auth is required", async () => {
    const ctx = createDynamicContext({ transport: "stdio", globalDefaults: { writeable: true } });
    await expect(
      serverManagement.connectServer(ctx, {
        api_url: authApiUrl(),
        requested_name: "auth-stdio",
      }),
    ).rejects.toThrow(/stdio transport/);
  });

  it("throws Path B UserError on HTTP when credentials are missing", async () => {
    const ctx = createDynamicContext({ transport: "http", globalDefaults: { writeable: true } });
    await expect(
      serverManagement.connectServer(ctx, { api_url: authApiUrl(), requested_name: "auth-http" }),
    ).rejects.toThrow(UserError);
  });

  it("connects after elicitation completion and lists stores", async () => {
    const ctx = createDynamicContext({ transport: "http", globalDefaults: { writeable: true } });
    const pending = ctx.pendingElicitations.create({
      reason: "connect",
      connectMode: "api_url",
      apiUrl: authApiUrl(),
    });
    ctx.pendingElicitations.complete(pending.elicitationId, {
      method: "api_token",
      token: authKey(),
    });

    const connected = requireConnectResult(
      await serverManagement.connectServer(ctx, {
        api_url: authApiUrl(),
        requested_name: "auth-connected",
      }),
    );

    const stores = await storeHandlers.listStores(ctx, connected.server, connected.connection_scope);
    expect(Array.isArray(stores)).toBe(true);
  });
});
