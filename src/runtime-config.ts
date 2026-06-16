import { parseCliArgs, type ParsedCliArgs } from "./cli.js";

export type RuntimeConfig = {
  transport: "stdio" | "http";
  host: string;
  port: number;
  sse: boolean;
  stateless: boolean;
  debug: boolean;
  configPath?: string;
};

const DEFAULTS: RuntimeConfig = {
  transport: "stdio",
  host: "127.0.0.1",
  port: 9090,
  sse: true,
  stateless: false,
  debug: true,
};

function envString(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value === "" || value === "false") return fallback;
  return String(value).trim();
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || !/^-?\d+$/.test(value)) return fallback;
  return parseInt(value, 10);
}

function resolveConfigPath(cli: ParsedCliArgs): string | undefined {
  if (cli.configPath) return cli.configPath;
  const fromEnv = envString("OPENFGA_MCP_CONFIG", "");
  if (fromEnv !== "" && !fromEnv.trimStart().startsWith("{")) {
    return fromEnv;
  }
  return undefined;
}

export function loadRuntimeConfig(argv: string[] = process.argv.slice(2)): RuntimeConfig {
  const cli = parseCliArgs(argv);

  const config: RuntimeConfig = {
    transport: envString("OPENFGA_MCP_TRANSPORT", DEFAULTS.transport) === "http" ? "http" : "stdio",
    host: envString("OPENFGA_MCP_TRANSPORT_HOST", DEFAULTS.host),
    port: envInt("OPENFGA_MCP_TRANSPORT_PORT", DEFAULTS.port),
    sse: envBool("OPENFGA_MCP_TRANSPORT_SSE", DEFAULTS.sse),
    stateless: envBool("OPENFGA_MCP_TRANSPORT_STATELESS", DEFAULTS.stateless),
    debug: envBool("OPENFGA_MCP_DEBUG", DEFAULTS.debug),
    configPath: resolveConfigPath(cli),
  };

  if (cli.transport) config.transport = cli.transport;
  if (cli.host) config.host = cli.host;
  if (cli.port !== undefined) config.port = cli.port;
  if (cli.sse !== undefined) config.sse = cli.sse;
  if (cli.stateless !== undefined) config.stateless = cli.stateless;
  if (cli.debug !== undefined) config.debug = cli.debug;
  if (cli.configPath) config.configPath = cli.configPath;

  return config;
}

export function applyRuntimeConfigToEnv(config: RuntimeConfig): void {
  process.env.OPENFGA_MCP_TRANSPORT = config.transport;
  process.env.OPENFGA_MCP_TRANSPORT_HOST = config.host;
  process.env.OPENFGA_MCP_TRANSPORT_PORT = String(config.port);
  process.env.OPENFGA_MCP_TRANSPORT_SSE = config.sse ? "true" : "false";
  process.env.OPENFGA_MCP_TRANSPORT_STATELESS = config.stateless ? "true" : "false";
  process.env.OPENFGA_MCP_DEBUG = config.debug ? "true" : "false";
}
