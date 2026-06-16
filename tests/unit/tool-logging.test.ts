import { afterEach, describe, expect, it, vi } from "vitest";
import * as debugLogger from "../../src/debug-logger.js";
import { withToolLogging } from "../../src/tool-logging.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
  vi.restoreAllMocks();
});

describe("withToolLogging", () => {
  it("logs successful tool calls", async () => {
    setEnv("OPENFGA_MCP_DEBUG", "true");
    const logToolCall = vi.spyOn(debugLogger, "logToolCall");

    const execute = withToolLogging("test_tool", async (value: string) => `ok:${value}`);
    await expect(execute("input")).resolves.toBe("ok:input");

    expect(logToolCall).toHaveBeenCalledWith("test_tool", ["input"], "ok:input");
  });

  it("logs and rethrows tool errors", async () => {
    setEnv("OPENFGA_MCP_DEBUG", "true");
    const logError = vi.spyOn(debugLogger, "logError");

    const execute = withToolLogging("failing_tool", async () => {
      throw new Error("boom");
    });

    await expect(execute()).rejects.toThrow("boom");
    expect(logError).toHaveBeenCalledWith(
      "boom",
      null,
      expect.objectContaining({ tool: "failing_tool" }),
    );
  });
});
