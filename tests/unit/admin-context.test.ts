import { describe, expect, it, vi } from "vitest";
import { resolveAdminTarget, resolveTupleTarget } from "../../src/admin-context.js";
import { createMockContext, createMultiServerContext, createOfflineContext } from "../helpers/mock-client.js";
import { setOnlineWritableMode } from "../helpers/env.js";

describe("resolveAdminTarget", () => {
  it("returns offline error when context is offline", () => {
    expect(resolveAdminTarget(createOfflineContext())).toContain("live OpenFGA instance");
  });

  it("resolves default server and optional store/model", () => {
    setOnlineWritableMode();
    const client = { check: vi.fn() };
    const ctx = createMockContext(client);
    const target = resolveAdminTarget(ctx, { store: "store-1", model: "model-1" });
    expect(typeof target).not.toBe("string");
    if (typeof target === "string") return;
    expect(target.client).toBe(client);
    expect(target.store).toBe("store-1");
    expect(target.model).toBe("model-1");
  });

  it("uses server default_store when store is omitted", () => {
    setOnlineWritableMode();
    const client = { check: vi.fn() };
    const ctx = createMockContext(client);
    ctx.pool!.globalDefaults = { default_store: "pinned-store", default_model: "pinned-model" };
    const target = resolveAdminTarget(ctx);
    expect(typeof target).not.toBe("string");
    if (typeof target === "string") return;
    expect(target.store).toBe("pinned-store");
    expect(target.model).toBe("pinned-model");
  });

  it("returns error when store is required but missing", () => {
    setOnlineWritableMode();
    const ctx = createMockContext({});
    expect(resolveTupleTarget(ctx, {})).toContain("store is required");
  });

  it("routes to named server", () => {
    setOnlineWritableMode();
    const dev = { check: vi.fn() };
    const prod = { check: vi.fn() };
    const ctx = createMultiServerContext({ dev, prod }, { defaultServer: "dev" });
    const target = resolveAdminTarget(ctx, { server: "prod", store: "store-1" });
    expect(typeof target).not.toBe("string");
    if (typeof target === "string") return;
    expect(target.client).toBe(prod);
    expect(target.serverRef).toBe("prod");
  });
});

describe("resolveTupleTarget", () => {
  it("requires store resolution for tuple operations", () => {
    setOnlineWritableMode();
    const ctx = createMockContext({});
    const target = resolveTupleTarget(ctx, { store: "store-1", model: "model-1" });
    expect(typeof target).not.toBe("string");
    if (typeof target === "string") return;
    expect(target.store).toBe("store-1");
    expect(target.model).toBe("model-1");
  });
});
