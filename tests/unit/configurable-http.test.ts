import { afterEach, describe, expect, it, vi } from "vitest";
import { FastMCP } from "fastmcp";
import { applyHttpConfiguration, registerConfigurableHttpMiddleware } from "../../src/configurable-http.js";
import { clearOpenFgaEnv } from "../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("applyHttpConfiguration", () => {
  it("applies configuration from valid JSON", () => {
    const result = applyHttpConfiguration(
      JSON.stringify({
        OPENFGA_MCP_API_URL: "https://api.example.com",
        OPENFGA_MCP_API_TOKEN: "test-token",
      }),
    );

    expect(result.isSuccessful()).toBe(true);
    expect(process.env.OPENFGA_MCP_API_URL).toBe("https://api.example.com");
    expect(process.env.OPENFGA_MCP_API_TOKEN).toBe("test-token");
  });

  it("returns errors for invalid JSON", () => {
    const result = applyHttpConfiguration("invalid json {");
    expect(result.isSuccessful()).toBe(false);
    expect(result.getErrors().length).toBeGreaterThan(0);
  });

  it("overrides existing environment variables", () => {
    process.env.OPENFGA_MCP_API_URL = "https://existing.example.com";
    process.env.OPENFGA_MCP_API_TOKEN = "existing-token";

    const result = applyHttpConfiguration(JSON.stringify({ OPENFGA_MCP_API_URL: "https://override.example.com" }));

    expect(result.isSuccessful()).toBe(true);
    expect(process.env.OPENFGA_MCP_API_URL).toBe("https://override.example.com");
    expect(process.env.OPENFGA_MCP_API_TOKEN).toBe("existing-token");
  });
});

describe("registerConfigurableHttpMiddleware", () => {
  it("registers middleware on the FastMCP Hono app", () => {
    const server = new FastMCP({ name: "test", version: "1.0.0" });
    const useSpy = vi.spyOn(server.getApp(), "use");

    registerConfigurableHttpMiddleware(server);

    expect(useSpy).toHaveBeenCalledWith("/mcp", expect.any(Function));
  });
});
