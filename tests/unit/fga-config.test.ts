import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildServerAuth,
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
      allow_dynamic_connections: true,
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

  it("accepts deprecated allow_runtime_connect as allow_dynamic_connections alias", () => {
    const result = parseFgaConfigDocument({
      allow_runtime_connect: true,
      servers: { dev: { api_url: "http://127.0.0.1:8080" } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.allow_dynamic_connections).toBe(true);
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

  it("accepts api_token auth object", () => {
    const result = parseFgaConfigDocument({
      servers: {
        prod: {
          api_url: "https://api.example",
          auth: { method: "api_token", token: "secret" },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.servers?.prod.auth).toEqual({ method: "api_token", token: "secret" });
  });

  it("accepts client_credentials auth object with optional audience and scopes", () => {
    const result = parseFgaConfigDocument({
      servers: {
        prod: {
          api_url: "https://api.example",
          auth: {
            method: "client_credentials",
            client_id: "id",
            client_secret: "secret",
            issuer: "https://issuer.example",
            audience: "https://api.example/",
            scopes: "read:tuples write:tuples",
          },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.servers?.prod.auth).toEqual({
      method: "client_credentials",
      client_id: "id",
      client_secret: "secret",
      issuer: "https://issuer.example",
      audience: "https://api.example/",
      scopes: "read:tuples write:tuples",
    });
  });

  it("rejects top-level credential fields", () => {
    const result = parseFgaConfigDocument({
      servers: { prod: { api_url: "https://api.example", api_token: "secret" } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("nested under auth"))).toBe(true);
  });

  it("rejects auth together with top-level credential fields", () => {
    const result = parseFgaConfigDocument({
      servers: {
        prod: {
          api_url: "https://api.example",
          api_token: "secret",
          auth: { method: "api_token", token: "secret" },
        },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("together with auth"))).toBe(true);
  });

  it("rejects unknown auth method", () => {
    const result = parseFgaConfigDocument({
      servers: {
        prod: {
          api_url: "https://api.example",
          auth: { method: "oauth", token: "x" },
        },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('method must be "api_token" or "client_credentials"'))).toBe(true);
  });

  it("rejects client_credentials missing required fields", () => {
    const result = parseFgaConfigDocument({
      servers: {
        prod: {
          api_url: "https://api.example",
          auth: { method: "client_credentials", client_id: "id" },
        },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("client_secret is required"))).toBe(true);
  });
});

describe("buildServerAuth", () => {
  it("builds api_token auth", () => {
    expect(buildServerAuth({ apiToken: "tok" })).toEqual({ method: "api_token", token: "tok" });
  });

  it("builds client_credentials auth", () => {
    expect(
      buildServerAuth({
        clientId: "id",
        clientSecret: "secret",
        issuer: "https://issuer.example",
        audience: "https://api.example/",
      }),
    ).toEqual({
      method: "client_credentials",
      client_id: "id",
      client_secret: "secret",
      issuer: "https://issuer.example",
      audience: "https://api.example/",
    });
  });

  it("rejects mixed token and client credentials", () => {
    expect(() => buildServerAuth({ apiToken: "tok", clientId: "id" })).toThrow(/not both/);
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

  it("bootstraps api_token auth from env", () => {
    setEnv("OPENFGA_MCP_API_URL", "http://127.0.0.1:8080");
    setEnv("OPENFGA_MCP_API_TOKEN", "secret");

    const result = loadLegacyEnvFgaConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.servers?.default.auth).toEqual({ method: "api_token", token: "secret" });
  });

  it("bootstraps client_credentials auth from env", () => {
    setEnv("OPENFGA_MCP_API_URL", "http://127.0.0.1:8080");
    setEnv("OPENFGA_MCP_API_CLIENT_ID", "id");
    setEnv("OPENFGA_MCP_API_CLIENT_SECRET", "secret");
    setEnv("OPENFGA_MCP_API_ISSUER", "https://issuer.example");
    setEnv("OPENFGA_MCP_API_AUDIENCE", "https://api.example/");

    const result = loadLegacyEnvFgaConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.servers?.default.auth).toEqual({
      method: "client_credentials",
      client_id: "id",
      client_secret: "secret",
      issuer: "https://issuer.example",
      audience: "https://api.example/",
    });
  });
});
