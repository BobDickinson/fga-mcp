import { afterEach, describe, expect, it } from "vitest";
import * as storeResources from "../../../src/resources/handlers/store.js";
import { isResourceTarget, resolveResourceTarget } from "../../../src/resource-resolver.js";
import { createMockContext } from "../../helpers/mock-client.js";
import {
  createIntegrationDynamicContext,
  createTestStore,
  deleteTestStore,
  getTestApiUrl,
  getTestClient,
  integrationResourceTarget,
  requireConnectResult,
  restoreIntegrationEnv,
} from "../helpers.js";
import * as serverManagement from "../../../src/tools/handlers/server-management.js";

afterEach(() => {
  restoreIntegrationEnv();
});

describe("Resource resolution integration", () => {
  it("resolves legacy tier target and lists stores from live OpenFGA", async () => {
    const ctx = createMockContext(getTestClient());
    const storeId = await createTestStore(`resource-legacy-${Date.now()}`);

    try {
      const target = resolveResourceTarget(ctx, {});
      expect(isResourceTarget(target)).toBe(true);
      if (!isResourceTarget(target)) return;

      const result = await storeResources.listStores(target);
      const ids = (result.stores as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(storeId);
    } finally {
      await deleteTestStore(storeId);
    }
  });

  it("resolves dynamic tier target and lists stores from live OpenFGA", async () => {
    const ctx = createIntegrationDynamicContext();
    const connected = requireConnectResult(
      await serverManagement.connectServer(ctx, {
        api_url: getTestApiUrl(),
        requested_name: "resource-dyn",
      }),
    );
    const storeId = await createTestStore(`resource-dynamic-${Date.now()}`);

    try {
      const target = resolveResourceTarget(ctx, {
        connectionScope: connected.connection_scope,
        server: connected.server,
        dynamicOnly: true,
      });
      expect(isResourceTarget(target)).toBe(true);
      if (!isResourceTarget(target)) return;
      expect(target.dynamic).toBe(true);

      const result = await storeResources.listStores(target);
      const ids = (result.stores as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(storeId);
    } finally {
      await deleteTestStore(storeId);
    }
  });

  it("reads a store via ResourceTarget helper against live OpenFGA", async () => {
    const storeName = `resource-target-${Date.now()}`;
    const storeId = await createTestStore(storeName);

    try {
      const result = await storeResources.getStore(integrationResourceTarget(), storeId);
      expect(result.id).toBe(storeId);
      expect(result.name).toBe(storeName);
    } finally {
      await deleteTestStore(storeId);
    }
  });
});
