import { describe, expect, it, vi } from "vitest";
import * as storeHandlers from "../../src/tools/handlers/store.js";
import { createMultiServerContext } from "../helpers/mock-client.js";
import { setOnlineWritableMode } from "../helpers/env.js";

describe("multi-server routing", () => {
  it("routes store operations to the selected server", async () => {
    setOnlineWritableMode();
    const devClient = {
      getStore: vi.fn().mockResolvedValue({ id: "dev-store", name: "dev" }),
    };
    const prodClient = {
      getStore: vi.fn().mockResolvedValue({ id: "prod-store", name: "prod" }),
    };

    const ctx = createMultiServerContext({ dev: devClient, prod: prodClient }, { defaultServer: "dev" });

    await storeHandlers.getStore(ctx, "dev-store", "dev");
    expect(devClient.getStore).toHaveBeenCalledWith({ storeId: "dev-store" });
    expect(prodClient.getStore).not.toHaveBeenCalled();

    await storeHandlers.getStore(ctx, "prod-store", "prod");
    expect(prodClient.getStore).toHaveBeenCalledWith({ storeId: "prod-store" });
  });
});
