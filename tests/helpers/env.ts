import { setActiveServerPool } from "../../src/server-pool.js";

const ENV_KEYS = [
  "OPENFGA_MCP_API_URL",
  "OPENFGA_MCP_API_TOKEN",
  "OPENFGA_MCP_API_CLIENT_ID",
  "OPENFGA_MCP_API_CLIENT_SECRET",
  "OPENFGA_MCP_API_ISSUER",
  "OPENFGA_MCP_API_AUDIENCE",
  "OPENFGA_MCP_API_WRITEABLE",
  "OPENFGA_MCP_API_RESTRICT",
  "OPENFGA_MCP_API_STORE",
  "OPENFGA_MCP_API_MODEL",
  "OPENFGA_MCP_DEBUG",
  "OPENFGA_MCP_TRANSPORT",
  "OPENFGA_MCP_TRANSPORT_HOST",
  "OPENFGA_MCP_TRANSPORT_PORT",
  "OPENFGA_MCP_TRANSPORT_SSE",
  "OPENFGA_MCP_TRANSPORT_STATELESS",
] as const;

export function clearOpenFgaEnv(): void {
  setActiveServerPool(null);
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

export function setOnlineWritableMode(url = "http://localhost:8080"): void {
  process.env.OPENFGA_MCP_API_URL = url;
  process.env.OPENFGA_MCP_API_WRITEABLE = "true";
}

export function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
