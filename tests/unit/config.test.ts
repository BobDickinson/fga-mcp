import { afterEach, describe, expect, it } from "vitest";
import {
  getConfiguredBool,
  getConfiguredInt,
  getConfiguredString,
  isOfflineMode,
  isRestrictedMode,
  isWriteEnabled,
} from "../../src/config.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
});

describe("getConfiguredString", () => {
  it("returns default for missing values", () => {
    expect(getConfiguredString("MISSING", "default")).toBe("default");
  });

  it("returns trimmed value", () => {
    setEnv("TEST_VAR", "  hello  ");
    expect(getConfiguredString("TEST_VAR", "")).toBe("hello");
  });

  it("treats false as default", () => {
    setEnv("TEST_VAR", "false");
    expect(getConfiguredString("TEST_VAR", "default")).toBe("default");
  });
});

describe("getConfiguredInt", () => {
  it("returns default for invalid values", () => {
    expect(getConfiguredInt("MISSING", 42)).toBe(42);
    setEnv("TEST_INT", "abc");
    expect(getConfiguredInt("TEST_INT", 42)).toBe(42);
  });

  it("parses integers", () => {
    setEnv("TEST_INT", "123");
    expect(getConfiguredInt("TEST_INT", 0)).toBe(123);
  });
});

describe("getConfiguredBool", () => {
  it("parses true values", () => {
    setEnv("TEST_BOOL", "true");
    expect(getConfiguredBool("TEST_BOOL", false)).toBe(true);
    setEnv("TEST_BOOL", "1");
    expect(getConfiguredBool("TEST_BOOL", false)).toBe(true);
  });

  it("parses false values", () => {
    setEnv("TEST_BOOL", "false");
    expect(getConfiguredBool("TEST_BOOL", true)).toBe(false);
    setEnv("TEST_BOOL", "0");
    expect(getConfiguredBool("TEST_BOOL", true)).toBe(false);
  });
});

describe("mode helpers", () => {
  it("detects offline mode", () => {
    clearOpenFgaEnv();
    expect(isOfflineMode()).toBe(true);

    setEnv("OPENFGA_MCP_API_URL", "http://localhost:8080");
    expect(isOfflineMode()).toBe(false);
  });

  it("detects restricted mode", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    expect(isRestrictedMode()).toBe(true);
  });

  it("detects write enabled", () => {
    setEnv("OPENFGA_MCP_API_WRITEABLE", "true");
    expect(isWriteEnabled()).toBe(true);
  });
});
