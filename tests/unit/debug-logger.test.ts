import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  logError,
  logRequest,
  logResponse,
  logServerLifecycle,
  logToolCall,
  resetDebugLoggerForTests,
  setDebugLoggerPathsForTests,
} from "../../src/debug-logger.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";

describe("DebugLogger", () => {
  let tempLogDir: string;

  beforeEach(() => {
    resetDebugLoggerForTests();
    clearOpenFgaEnv();
    tempLogDir = mkdtempSync(join(tmpdir(), "fga-mcp-debug-"));
    setDebugLoggerPathsForTests(tempLogDir);
  });

  afterEach(() => {
    resetDebugLoggerForTests();
    clearOpenFgaEnv();
    if (existsSync(tempLogDir)) {
      rmSync(tempLogDir, { recursive: true, force: true });
    }
  });

  const logPath = () => join(tempLogDir, "mcp-debug.log");

  describe("debug mode control", () => {
    it("logs when debug is enabled by default", () => {
      logRequest("test.method", { param: "value" }, "test-id");
      expect(existsSync(logPath())).toBe(true);
      const content = readFileSync(logPath(), "utf8");
      expect(content).toContain("REQUEST");
      expect(content).toContain("test.method");
    });

    it("does not log when debug is disabled", () => {
      setEnv("OPENFGA_MCP_DEBUG", "false");
      logRequest("test.method", { param: "value" }, "test-id");
      expect(existsSync(logPath())).toBe(false);
    });
  });

  describe("logRequest", () => {
    it("logs request with all fields", () => {
      logRequest("tools/call", { tool: "createStore", args: { name: "test" } }, "req-123");

      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.type).toBe("REQUEST");
      expect(logEntry.id).toBe("req-123");
      expect(logEntry.method).toBe("tools/call");
      expect(logEntry.params).toEqual({ tool: "createStore", args: { name: "test" } });
      expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it("logs request without ID", () => {
      logRequest("initialize", { capabilities: [] }, null);
      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.id).toBeNull();
      expect(logEntry.method).toBe("initialize");
    });
  });

  describe("logResponse", () => {
    it("logs response with all fields", () => {
      const response = { result: { success: true }, meta: { duration: 123 } };
      logResponse(response, "resp-456");

      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.type).toBe("RESPONSE");
      expect(logEntry.id).toBe("resp-456");
      expect(logEntry.response).toEqual(response);
    });
  });

  describe("logError", () => {
    it("logs error with context", () => {
      const context = { file: "test.ts", line: 42, trace: ["stack", "trace"] };
      logError("Something went wrong", "err-789", context);

      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.type).toBe("ERROR");
      expect(logEntry.id).toBe("err-789");
      expect(logEntry.error).toBe("Something went wrong");
      expect(logEntry.context).toEqual(context);
    });

    it("logs error without context", () => {
      logError("Simple error", null, null);
      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.error).toBe("Simple error");
      expect(logEntry.context).toBeNull();
    });
  });

  describe("logToolCall", () => {
    it("logs tool call with object result", () => {
      const args = ["store-123", "latest"];
      const result = { allowed: true, resolution: "direct" };
      logToolCall("checkPermission", args, result, "tool-001");

      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.type).toBe("TOOL_CALL");
      expect(logEntry.tool).toBe("checkPermission");
      expect(logEntry.arguments).toEqual(args);
      expect(logEntry.result).toEqual(result);
    });

    it("wraps non-object results", () => {
      logToolCall("simpleMethod", [], "string result", null);
      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.result).toEqual({ value: "string result" });
    });
  });

  describe("logServerLifecycle", () => {
    it("logs server lifecycle events with PID", () => {
      const context = { version: "2.0.0", capabilities: ["tools", "resources"] };
      logServerLifecycle("startup", context);

      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.type).toBe("SERVER_LIFECYCLE");
      expect(logEntry.event).toBe("startup");
      expect(logEntry.context).toEqual(context);
      expect(logEntry.pid).toBe(process.pid);
    });
  });

  describe("file operations", () => {
    it("creates log directory if it does not exist", () => {
      rmSync(tempLogDir, { recursive: true, force: true });
      resetDebugLoggerForTests();
      setDebugLoggerPathsForTests(tempLogDir);

      logRequest("test", {});

      expect(existsSync(tempLogDir)).toBe(true);
      expect(existsSync(logPath())).toBe(true);
    });

    it("appends to existing log file", () => {
      logRequest("first", { order: 1 });
      logRequest("second", { order: 2 });

      const lines = readFileSync(logPath(), "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).method).toBe("first");
      expect(JSON.parse(lines[1]).method).toBe("second");
    });

    it("handles multiple log entry types", () => {
      logRequest("request1", {});
      logResponse({ result: "ok" }, "id1");
      logError("Error occurred");
      logToolCall("tool1", [], "result");
      logServerLifecycle("event1");

      const types = readFileSync(logPath(), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).type);

      expect(types).toEqual(["REQUEST", "RESPONSE", "ERROR", "TOOL_CALL", "SERVER_LIFECYCLE"]);
    });
  });

  describe("JSON encoding", () => {
    it("handles special characters in log entries", () => {
      const params = {
        unicode: "日本語",
        emoji: "🎉",
        special: "line\nbreak\ttab",
      };
      logRequest("test", params);

      const logEntry = JSON.parse(readFileSync(logPath(), "utf8").trim());
      expect(logEntry.params).toEqual(params);
    });
  });
});
