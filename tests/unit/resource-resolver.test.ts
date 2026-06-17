import { describe, expect, it, vi } from "vitest";
import {
  getResourceRegistrationPlan,
  normalizeResourceTarget,
  resolveResourceTarget,
} from "../../src/resource-resolver.js";
import { createDynamicContext, createMockContext, createMultiServerContext, createOfflineContext } from "../helpers/mock-client.js";

describe("getResourceRegistrationPlan", () => {
  it("selects legacy tier for single fixed server", () => {
    const plan = getResourceRegistrationPlan(createMockContext({}));
    expect(plan).toEqual({ legacyFixed: true, fixedServerPrefixed: false, dynamicScopePrefixed: false });
  });

  it("selects server-prefixed tier for multiple fixed servers", () => {
    const plan = getResourceRegistrationPlan(createMultiServerContext({ dev: {}, prod: {} }));
    expect(plan).toEqual({ legacyFixed: false, fixedServerPrefixed: true, dynamicScopePrefixed: false });
  });

  it("registers dynamic tier when runtime connect is enabled", () => {
    const plan = getResourceRegistrationPlan(createDynamicContext({ fixedClients: { dev: {} } }));
    expect(plan.dynamicScopePrefixed).toBe(true);
    expect(plan.fixedServerPrefixed).toBe(true);
    expect(plan.legacyFixed).toBe(false);
  });

  it("registers nothing for admin when offline", () => {
    const plan = getResourceRegistrationPlan(createOfflineContext());
    expect(plan).toEqual({ legacyFixed: false, fixedServerPrefixed: false, dynamicScopePrefixed: false });
  });
});

describe("normalizeResourceTarget", () => {
  it("maps uri params to target input", () => {
    expect(
      normalizeResourceTarget({
        connectionScope: "scope-1",
        server: "dev",
        storeId: "store-1",
        modelId: "model-1",
      }),
    ).toEqual({
      connectionScope: "scope-1",
      server: "dev",
      storeId: "store-1",
      model: "model-1",
    });
  });
});

describe("resolveResourceTarget", () => {
  it("resolves fixed server from legacy params", () => {
    const client = { listStores: vi.fn() };
    const ctx = createMockContext(client);
    const target = resolveResourceTarget(ctx, { server: "default" });
    expect("error" in target).toBe(false);
    if ("error" in target) return;
    expect(target.client).toBe(client);
    expect(target.dynamic).toBe(false);
  });

  it("resolves named server in multi-server config", () => {
    const prod = { listStores: vi.fn() };
    const ctx = createMultiServerContext({ dev: {}, prod }, { defaultServer: "dev" });
    const target = resolveResourceTarget(ctx, { server: "prod" });
    expect("error" in target).toBe(false);
    if ("error" in target) return;
    expect(target.client).toBe(prod);
    expect(target.serverRef).toBe("prod");
  });
});