import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadFgaConfigFromFile,
  loadLegacyEnvFgaConfig,
  parseFgaConfigDocument,
} from "../../src/fga-config.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
});

describe("parseFgaConfigDocument", () => {
  it("accepts a valid multi-server config", () => {
    const result = parseFgaConfigDocument({
      default_server: "dev",
      defaults: { writeable: false },
      servers: {
        dev: { api_url: "http://127.0.0.1:8080", writeable: true },
        prod: { api_url: "https://prod.example", restrict: true, default_store: "s1", default_model: "m1" },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.default_server).toBe("dev");
    expect(Object.keys(result.config.servers ?? {})).toEqual(["dev", "prod"]);
  });

  it("accepts dynamic config limits", () => {
    const result = parseFgaConfigDocument({
      allow_runtime_connect: true,
      dynamic: {
        scope_idle_ttl_seconds: 3600,
        max_servers_per_scope: null,
        max_scopes: 50,
      },
      servers: { dev: { api_url: "http://127.0.0.1:8080" } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.dynamic).toEqual({
      scope_idle_ttl_seconds: 3600,
      max_servers_per_scope: null,
      max_scopes: 50,
    });
  });

  it("rejects restrict without pins", () => {
    const result = parseFgaConfigDocument({
      servers: { prod: { api_url: "http://127.0.0.1:8080", restrict: true } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("restrict requires"))).toBe(true);
  });

  it("rejects model-only pin when restrict is enabled", () => {
    const result = parseFgaConfigDocument({
      servers: {
        prod: { api_url: "http://127.0.0.1:8080", restrict: true, default_model: "m1" },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("default_model requires default_store"))).toBe(true);
  });
});

describe("loadFgaConfigFromFile", () => {
  it("loads config from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "fga-config-"));
    const path = join(dir, "fga.json");
    writeFileSync(
      path,
      JSON.stringify({
        default_server: "default",
        servers: { default: { api_url: "http://127.0.0.1:8080" } },
      }),
    );

    const result = loadFgaConfigFromFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("file");
    expect(result.config.servers?.default.api_url).toBe("http://127.0.0.1:8080");
  });
});

describe("loadLegacyEnvFgaConfig", () => {
  it("returns empty config when no legacy env is set", () => {
    clearOpenFgaEnv();
    const result = loadLegacyEnvFgaConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.servers).toBeUndefined();
    expect(result.source).toBe("legacy-env");
  });

  it("bootstraps a default server from OPENFGA_MCP_API_URL", () => {
    setEnv("OPENFGA_MCP_API_URL", "http://127.0.0.1:8080");
    setEnv("OPENFGA_MCP_API_WRITEABLE", "true");
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "store-1");
    setEnv("OPENFGA_MCP_API_MODEL", "model-1");

    const result = loadLegacyEnvFgaConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.default_server).toBe("default");
    expect(result.config.servers?.default.api_url).toBe("http://127.0.0.1:8080");
    expect(result.config.defaults?.writeable).toBe(true);
    expect(result.config.defaults?.restrict).toBe(true);
    expect(result.config.defaults?.default_store).toBe("store-1");
    expect(result.config.defaults?.default_model).toBe("model-1");
  });
});
