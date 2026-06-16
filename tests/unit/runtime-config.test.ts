import { afterEach, describe, expect, it } from "vitest";
import { applyRuntimeConfigToEnv, loadRuntimeConfig } from "../../src/runtime-config.js";

const ENV_KEYS = [
  "OPENFGA_MCP_TRANSPORT",
  "OPENFGA_MCP_TRANSPORT_HOST",
  "OPENFGA_MCP_TRANSPORT_PORT",
  "OPENFGA_MCP_TRANSPORT_SSE",
  "OPENFGA_MCP_TRANSPORT_STATELESS",
  "OPENFGA_MCP_DEBUG",
  "OPENFGA_MCP_CONFIG",
] as const;

const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function snapshotEnv(): void {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
}

describe("loadRuntimeConfig", () => {
  it("uses defaults when env and CLI are empty", () => {
    snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];

    const config = loadRuntimeConfig([]);
    expect(config).toMatchObject({
      transport: "stdio",
      host: "127.0.0.1",
      port: 9090,
      sse: true,
      stateless: false,
      debug: true,
    });
  });

  it("applies env then CLI overrides", () => {
    snapshotEnv();
    process.env.OPENFGA_MCP_TRANSPORT = "http";
    process.env.OPENFGA_MCP_TRANSPORT_PORT = "8081";
    process.env.OPENFGA_MCP_DEBUG = "false";

    const config = loadRuntimeConfig(["--transport", "stdio", "--port", "4000", "--debug"]);
    expect(config.transport).toBe("stdio");
    expect(config.port).toBe(4000);
    expect(config.debug).toBe(true);
  });

  it("resolves config path from CLI over env file path", () => {
    snapshotEnv();
    process.env.OPENFGA_MCP_CONFIG = "/env/path.json";

    const config = loadRuntimeConfig(["--config", "/cli/path.json"]);
    expect(config.configPath).toBe("/cli/path.json");
  });

  it("ignores inline JSON in OPENFGA_MCP_CONFIG for runtime config path", () => {
    snapshotEnv();
    process.env.OPENFGA_MCP_CONFIG = '{"servers":{}}';

    const config = loadRuntimeConfig([]);
    expect(config.configPath).toBeUndefined();
  });
});

describe("applyRuntimeConfigToEnv", () => {
  it("writes transport settings to env", () => {
    snapshotEnv();
    applyRuntimeConfigToEnv({
      transport: "http",
      host: "0.0.0.0",
      port: 7777,
      sse: false,
      stateless: true,
      debug: false,
    });

    expect(process.env.OPENFGA_MCP_TRANSPORT).toBe("http");
    expect(process.env.OPENFGA_MCP_TRANSPORT_HOST).toBe("0.0.0.0");
    expect(process.env.OPENFGA_MCP_TRANSPORT_PORT).toBe("7777");
    expect(process.env.OPENFGA_MCP_TRANSPORT_SSE).toBe("false");
    expect(process.env.OPENFGA_MCP_TRANSPORT_STATELESS).toBe("true");
    expect(process.env.OPENFGA_MCP_DEBUG).toBe("false");
  });
});
