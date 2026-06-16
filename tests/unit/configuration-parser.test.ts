import { afterEach, describe, expect, it } from "vitest";
import { ConfigurationParser } from "../../src/configuration-parser.js";

const OPENFGA_ENV_PREFIX = "OPENFGA_MCP_";

function clearOpenFgaEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(OPENFGA_ENV_PREFIX)) {
      delete process.env[key];
    }
  }
}

afterEach(() => {
  clearOpenFgaEnv();
});

describe("ConfigurationParser", () => {
  describe("parseAndApply", () => {
    it("parses valid JSON configuration", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_URL: "https://api.example.com",
        OPENFGA_MCP_API_TOKEN: "test-token",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(result.getErrors()).toEqual([]);
      expect(result.getAppliedKeys()).toContain("OPENFGA_MCP_API_URL");
      expect(result.getAppliedKeys()).toContain("OPENFGA_MCP_API_TOKEN");
      expect(process.env.OPENFGA_MCP_API_URL).toBe("https://api.example.com");
      expect(process.env.OPENFGA_MCP_API_TOKEN).toBe("test-token");
    });

    it("handles invalid JSON gracefully", () => {
      const parser = new ConfigurationParser();
      const result = parser.parseAndApply("invalid json {");

      expect(result.isSuccessful()).toBe(false);
      expect(result.hasErrors()).toBe(true);
      expect(result.getErrors()[0]).toMatch(/^Invalid JSON:/);
      expect(result.getAppliedKeys()).toEqual([]);
    });

    it("converts boolean values correctly", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_WRITEABLE: true,
        OPENFGA_MCP_DEBUG: false,
        OPENFGA_MCP_TRANSPORT_SSE: 1,
        OPENFGA_MCP_TRANSPORT_STATELESS: "0",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(process.env.OPENFGA_MCP_API_WRITEABLE).toBe("true");
      expect(process.env.OPENFGA_MCP_DEBUG).toBe("false");
      expect(process.env.OPENFGA_MCP_TRANSPORT_SSE).toBe("true");
      expect(process.env.OPENFGA_MCP_TRANSPORT_STATELESS).toBe("false");
    });

    it("converts integer values correctly", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_TRANSPORT_PORT: 8080,
        OPENFGA_MCP_TRANSPORT_HOST: "127.0.0.1",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(process.env.OPENFGA_MCP_TRANSPORT_PORT).toBe("8080");
      expect(process.env.OPENFGA_MCP_TRANSPORT_HOST).toBe("127.0.0.1");
    });

    it("ignores unsupported configuration keys silently", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_URL: "https://api.example.com",
        UNSUPPORTED_KEY: "value",
        ANOTHER_INVALID: 123,
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(result.getErrors()).toEqual([]);
      expect(result.getAppliedKeys()).toContain("OPENFGA_MCP_API_URL");
      expect(result.getAppliedKeys()).not.toContain("UNSUPPORTED_KEY");
      expect(result.getAppliedKeys()).not.toContain("ANOTHER_INVALID");
      expect(process.env.OPENFGA_MCP_API_URL).toBe("https://api.example.com");
      expect(process.env.UNSUPPORTED_KEY).toBeUndefined();
    });

    it("validates OAuth2 configuration combinations", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_CLIENT_ID: "client-id",
        OPENFGA_MCP_API_CLIENT_SECRET: "client-secret",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(false);
      expect(result.hasErrors()).toBe(true);
      expect(result.getErrors()).toContain(
        "OAuth2 client credentials require all of: OPENFGA_MCP_API_CLIENT_ID, OPENFGA_MCP_API_CLIENT_SECRET, OPENFGA_MCP_API_ISSUER, OPENFGA_MCP_API_AUDIENCE",
      );
    });

    it("validates restricted mode configuration", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_RESTRICT: true,
        OPENFGA_MCP_API_STORE: "store-id",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(false);
      expect(result.hasErrors()).toBe(true);
      expect(result.getErrors()).toContain(
        "Restricted mode requires both OPENFGA_MCP_API_STORE and OPENFGA_MCP_API_MODEL to be set",
      );
    });

    it("accepts valid OAuth2 configuration", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_CLIENT_ID: "client-id",
        OPENFGA_MCP_API_CLIENT_SECRET: "client-secret",
        OPENFGA_MCP_API_ISSUER: "https://issuer.example.com",
        OPENFGA_MCP_API_AUDIENCE: "https://api.example.com",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(result.getErrors()).toEqual([]);
      expect(process.env.OPENFGA_MCP_API_CLIENT_ID).toBe("client-id");
      expect(process.env.OPENFGA_MCP_API_CLIENT_SECRET).toBe("client-secret");
      expect(process.env.OPENFGA_MCP_API_ISSUER).toBe("https://issuer.example.com");
      expect(process.env.OPENFGA_MCP_API_AUDIENCE).toBe("https://api.example.com");
    });

    it("accepts valid restricted mode configuration", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_RESTRICT: true,
        OPENFGA_MCP_API_STORE: "store-id",
        OPENFGA_MCP_API_MODEL: "model-id",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(result.getErrors()).toEqual([]);
      expect(process.env.OPENFGA_MCP_API_RESTRICT).toBe("true");
      expect(process.env.OPENFGA_MCP_API_STORE).toBe("store-id");
      expect(process.env.OPENFGA_MCP_API_MODEL).toBe("model-id");
    });

    it("reports type validation errors", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_WRITEABLE: ["not", "a", "boolean"],
        OPENFGA_MCP_TRANSPORT_PORT: "not-a-number",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(false);
      expect(result.hasErrors()).toBe(true);
      expect(result.getErrors()).toContain("OPENFGA_MCP_API_WRITEABLE must be a boolean, object given");
      expect(result.getErrors()).toContain("OPENFGA_MCP_TRANSPORT_PORT must be numeric, string given");
    });

    it("handles empty configuration object", () => {
      const parser = new ConfigurationParser();
      const result = parser.parseAndApply(JSON.stringify({}));

      expect(result.isSuccessful()).toBe(true);
      expect(result.getErrors()).toEqual([]);
      expect(result.getAppliedKeys()).toEqual([]);
    });

    it("rejects non-object JSON", () => {
      const parser = new ConfigurationParser();
      const result = parser.parseAndApply(JSON.stringify("string value"));

      expect(result.isSuccessful()).toBe(false);
      expect(result.hasErrors()).toBe(true);
      expect(result.getErrors()).toContain("Configuration must be a JSON object");
    });

    it("stores unmasked sensitive values in environment", () => {
      const parser = new ConfigurationParser();
      const json = JSON.stringify({
        OPENFGA_MCP_API_TOKEN: "very-secret-token-12345",
        OPENFGA_MCP_API_URL: "https://api.example.com",
      });

      const result = parser.parseAndApply(json);

      expect(result.isSuccessful()).toBe(true);
      expect(process.env.OPENFGA_MCP_API_TOKEN).toBe("very-secret-token-12345");
      expect(process.env.OPENFGA_MCP_API_URL).toBe("https://api.example.com");
    });
  });
});
