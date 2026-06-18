import { afterEach, describe, expect, it } from "vitest";
import * as serverManagement from "../../../src/tools/handlers/server-management.js";
import * as storeHandlers from "../../../src/tools/handlers/store.js";
import {
  createIntegrationDynamicContext,
  createTestStore,
  deleteTestStore,
  getTestApiUrl,
  requireConnectResult,
  restoreIntegrationEnv,
} from "../helpers.js";

afterEach(() => {
  restoreIntegrationEnv();
});

async function connectIntegrationServer(ctx = createIntegrationDynamicContext(), requestedName = "integ") {
  return requireConnectResult(
    await serverManagement.connectServer(ctx, {
      api_url: getTestApiUrl(),
      requested_name: requestedName,
    }),
  );
}

describe("Dynamic server integration", () => {
  it("connects to the live OpenFGA instance and lists stores in the dynamic scope", async () => {
    const ctx = createIntegrationDynamicContext();
    const storeId = await createTestStore(`dynamic-list-${Date.now()}`);

    try {
      const connected = await connectIntegrationServer(ctx);
      const result = await storeHandlers.listStores(ctx, connected.server, connected.connection_scope);

      expect(Array.isArray(result)).toBe(true);
      const ids = (result as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(storeId);
    } finally {
      await deleteTestStore(storeId);
    }
  });

  it("creates a store through the dynamic connection path", async () => {
    const ctx = createIntegrationDynamicContext();
    const connected = await connectIntegrationServer(ctx);
    const storeName = `dynamic-create-${Date.now()}`;

    const createResult = await storeHandlers.createStore(
      ctx,
      storeName,
      connected.server,
      connected.connection_scope,
    );
    expect(createResult).toContain("✅ Successfully created store");

    const match = createResult.match(/please use the ID ([a-zA-Z0-9-]+)/);
    expect(match?.[1]).toBeTruthy();

    const getResult = await storeHandlers.getStore(ctx, match![1], connected.server, connected.connection_scope);
    expect(getResult).toEqual(expect.objectContaining({ id: match![1], name: storeName }));

    await storeHandlers.deleteStore(ctx, match![1], connected.server, connected.connection_scope);
  });

  it("upserts when reconnecting the same api_url within a scope", async () => {
    const ctx = createIntegrationDynamicContext();
    const first = await connectIntegrationServer(ctx, "dev");
    expect(first.renamed).toBe(false);
    expect(first.server).toBe("dev");

    const second = requireConnectResult(
      await serverManagement.connectServer(ctx, {
        connection_scope: first.connection_scope,
        api_url: getTestApiUrl(),
        requested_name: "dev",
      }),
    );

    expect(second.connection_scope).toBe(first.connection_scope);
    expect(second.server).toBe("dev");
    expect(second.renamed).toBe(false);

    const listed = await serverManagement.listServers(ctx, first.connection_scope);
    expect(listed).toMatchObject({
      dynamic_connections_enabled: true,
      connection_scope: first.connection_scope,
      servers: [expect.objectContaining({ name: "dev", fixed: false, default: true })],
    });
  });

  it("drops the scope on last disconnect and mints a new scope on reconnect", async () => {
    const ctx = createIntegrationDynamicContext();
    const first = await connectIntegrationServer(ctx);
    expect(ctx.dynamicStore?.getScopeCount()).toBe(1);

    const disconnectResult = await serverManagement.disconnectServer(
      ctx,
      first.connection_scope,
      first.server,
    );
    expect(disconnectResult).toContain("✅ Disconnected");
    expect(ctx.dynamicStore?.getScopeCount()).toBe(0);

    const second = await connectIntegrationServer(ctx);
    expect(second.connection_scope).not.toBe(first.connection_scope);
    expect(ctx.dynamicStore?.getScopeCount()).toBe(1);
  });

  it("works with a dynamic-only context (no fixed server pool)", async () => {
    const ctx = createIntegrationDynamicContext();
    expect(ctx.pool).toBeNull();
    expect(ctx.dynamicStore).not.toBeNull();

    const unscoped = await serverManagement.listServers(ctx);
    expect(unscoped).toEqual({
      dynamic_connections_enabled: true,
      servers: [],
    });

    const connected = await connectIntegrationServer(ctx);
    const result = await storeHandlers.listStores(ctx, connected.server, connected.connection_scope);
    expect(Array.isArray(result)).toBe(true);
  });

  it("lists dynamic servers within a scope via list_servers", async () => {
    const ctx = createIntegrationDynamicContext();
    const connected = await connectIntegrationServer(ctx, "staging");

    const result = await serverManagement.listServers(ctx, connected.connection_scope);
    expect(result).toMatchObject({
      dynamic_connections_enabled: true,
      connection_scope: connected.connection_scope,
      servers: [expect.objectContaining({ name: "staging", api_url: getTestApiUrl(), fixed: false, default: true })],
    });
  });

  it("returns dynamic_connections_enabled on unscoped list_servers", async () => {
    const ctx = createIntegrationDynamicContext();
    await connectIntegrationServer(ctx);

    const result = await serverManagement.listServers(ctx);
    expect(result).toMatchObject({
      dynamic_connections_enabled: true,
      servers: [],
    });
  });
});
