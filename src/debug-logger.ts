import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredBool } from "./config.js";

type LogEntry = Record<string, unknown>;

let logDir: string | null = null;
let logFile: string | null = null;
let loggedPathAnnouncement = false;

function isTestEnvironment(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

function getProjectRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  let dir = currentDir;

  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }

  return dirname(currentDir);
}

function initializePaths(): void {
  if (logDir === null) {
    logDir = join(getProjectRoot(), "logs");
    logFile = join(logDir, "mcp-debug.log");
  }
}

function ensureLogDirectory(): void {
  initializePaths();

  if (!logDir || !logFile) {
    return;
  }

  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true, mode: 0o755 });
    } catch {
      if (!isTestEnvironment()) {
        process.stderr.write(`[MCP DEBUG] Failed to create log directory: ${logDir}\n`);
      }
      return;
    }
  }

  if (!loggedPathAnnouncement && !isTestEnvironment()) {
    process.stderr.write(`[MCP DEBUG] Logging to: ${logFile}\n`);
    loggedPathAnnouncement = true;
  }
}

function writeLog(entry: LogEntry): void {
  if (!logFile) {
    return;
  }

  let jsonString: string;
  try {
    jsonString = JSON.stringify(entry);
  } catch {
    jsonString = '{"error":"Failed to encode log entry"}';
  }

  try {
    appendFileSync(logFile, `${jsonString}\n`, { encoding: "utf8" });
  } catch {
    if (!isTestEnvironment()) {
      process.stderr.write(`[MCP DEBUG] Failed to write to log file: ${logFile}\n`);
    }
  }
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function isDebugEnabled(): boolean {
  return getConfiguredBool("OPENFGA_MCP_DEBUG", true);
}

export function resetDebugLoggerForTests(): void {
  logDir = null;
  logFile = null;
  loggedPathAnnouncement = false;
}

export function setDebugLoggerPathsForTests(directory: string): void {
  logDir = directory;
  logFile = join(directory, "mcp-debug.log");
}

export function logError(error: string, id: string | null = null, context: LogEntry | null = null): void {
  if (!isDebugEnabled()) {
    return;
  }

  ensureLogDirectory();
  writeLog({
    timestamp: timestamp(),
    type: "ERROR",
    id,
    error,
    context,
  });
}

export function logRequest(method: string, params: LogEntry, id: string | null = null): void {
  if (!isDebugEnabled()) {
    return;
  }

  ensureLogDirectory();
  writeLog({
    timestamp: timestamp(),
    type: "REQUEST",
    id,
    method,
    params,
  });
}

export function logResponse(response: LogEntry, id: string | null = null): void {
  if (!isDebugEnabled()) {
    return;
  }

  ensureLogDirectory();
  writeLog({
    timestamp: timestamp(),
    type: "RESPONSE",
    id,
    response,
  });
}

export function logServerLifecycle(event: string, context: LogEntry = {}): void {
  if (!isDebugEnabled()) {
    return;
  }

  ensureLogDirectory();
  writeLog({
    timestamp: timestamp(),
    type: "SERVER_LIFECYCLE",
    event,
    context,
    pid: process.pid,
  });
}

export function logToolCall(
  toolName: string,
  args: unknown[],
  result: unknown,
  id: string | null = null,
): void {
  if (!isDebugEnabled()) {
    return;
  }

  ensureLogDirectory();
  writeLog({
    timestamp: timestamp(),
    type: "TOOL_CALL",
    id,
    tool: toolName,
    arguments: args,
    result: result !== null && typeof result === "object" ? result : { value: result },
  });
}
