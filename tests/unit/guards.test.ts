import { afterEach, describe, expect, it } from "vitest";
import {
  checkOfflineMode,
  checkOfflineModeResource,
  checkRestrictedMode,
  checkRestrictedModeForWrites,
  checkRestrictedModePrompt,
  checkRestrictedModeResource,
  checkWritePermission,
  promptErrorResponse,
  promptUserMessage,
} from "../../src/guards.js";
import { clearOpenFgaEnv, setEnv, setOnlineWritableMode } from "../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
});

describe("checkOfflineMode", () => {
  it("returns null when online", () => {
    setOnlineWritableMode();
    expect(checkOfflineMode("Test Operation")).toBeNull();
  });

  it("returns error when offline", () => {
    clearOpenFgaEnv();
    const result = checkOfflineMode("Test Operation");
    expect(result).toContain("Test Operation");
    expect(result).toContain("OPENFGA_MCP_API_URL");
  });

  it("returns error with custom operation name", () => {
    clearOpenFgaEnv();
    const result = checkOfflineMode("Fetching authorization models");
    expect(result).toContain("Fetching authorization models");
    expect(result).toContain("requires a live OpenFGA instance");
  });

  it("returns null when token is set without URL", () => {
    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_TOKEN", "some-token");
    expect(checkOfflineMode("Operation")).toBeNull();
  });

  it("returns null when client ID is set without URL", () => {
    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_CLIENT_ID", "client-123");
    expect(checkOfflineMode("Operation")).toBeNull();
  });
});

describe("checkWritePermission", () => {
  it("blocks when write disabled", () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_WRITEABLE", "false");
    expect(checkWritePermission("create stores")).toContain("Write operations are disabled");
  });
});

describe("checkRestrictedMode", () => {
  it("returns null when restricted mode is disabled", () => {
    clearOpenFgaEnv();
    expect(checkRestrictedMode("any-store", "any-model")).toBeNull();
  });

  it("returns null when restricted mode is explicitly false", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "false");
    expect(checkRestrictedMode("store-123", "model-456")).toBeNull();
  });

  it('returns null for restrict values other than "true"', () => {
    for (const value of ["yes", "1", "TRUE"]) {
      setEnv("OPENFGA_MCP_API_RESTRICT", value);
      expect(checkRestrictedMode("store", "model")).toBeNull();
    }
  });

  it("blocks non-allowed store", () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    expect(checkRestrictedMode("other-store")).toContain("allowed-store");
  });

  it("returns null when querying the configured store", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    expect(checkRestrictedMode("allowed-store", null)).toBeNull();
  });

  it("returns null when no store restriction is configured", () => {
    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    expect(checkRestrictedMode("any-store", null)).toBeNull();
  });

  it("returns null when store ID is null", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "restricted-store");
    expect(checkRestrictedMode(null, null)).toBeNull();
  });

  it("blocks non-allowed model", () => {
    setOnlineWritableMode();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    expect(checkRestrictedMode("store", "other-model")).toContain("allowed-model");
  });

  it("returns null when querying the configured model", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    expect(checkRestrictedMode(null, "allowed-model")).toBeNull();
  });

  it("returns null when no model restriction is configured", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    expect(checkRestrictedMode(null, "any-model")).toBeNull();
  });

  it("returns null when model ID is null", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "restricted-model");
    expect(checkRestrictedMode(null, null)).toBeNull();
  });

  it("returns null when both store and model match", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    expect(checkRestrictedMode("allowed-store", "allowed-model")).toBeNull();
  });

  it("returns store error first when both do not match", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    const result = checkRestrictedMode("wrong-store", "wrong-model");
    expect(result).toContain("allowed-store");
    expect(result).not.toContain("allowed-model");
  });

  it("allows partial restrictions", () => {
    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    expect(checkRestrictedMode("allowed-store", "any-model")).toBeNull();

    clearOpenFgaEnv();
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_MODEL", "allowed-model");
    expect(checkRestrictedMode("any-store", "allowed-model")).toBeNull();
  });

  it("handles special characters in store names", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "store-with-special_chars.123");
    expect(checkRestrictedMode("store-with-special_chars.123", null)).toBeNull();
    expect(checkRestrictedMode("different-store", null)).toContain("store-with-special_chars.123");
  });

  it("handles case-sensitive store comparisons", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "MyStore");
    expect(checkRestrictedMode("mystore", null)).toContain("MyStore");
    expect(checkRestrictedMode("MyStore", null)).toBeNull();
  });

  it("handles whitespace in store configuration", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", " ");
    expect(checkRestrictedMode("any-store", null)).toBeNull();
  });
});

describe("checkRestrictedModeForWrites", () => {
  it("blocks writes in restricted mode", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    expect(checkRestrictedModeForWrites("create stores")).toContain("restricted mode");
  });
});

describe("resource guard variants", () => {
  it("returns error object for offline resource", () => {
    clearOpenFgaEnv();
    const result = checkOfflineModeResource("Listing stores");
    expect(result).toEqual({ error: expect.stringContaining("Listing stores") });
  });

  it("returns error object for restricted resource", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const result = checkRestrictedModeResource("other-store");
    expect(result?.error).toContain("allowed-store");
  });
});

describe("prompt guard variants", () => {
  it("blocks prompt for wrong store in restricted mode", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    expect(checkRestrictedModePrompt("other-store")).toContain("access guidance");
  });
});

describe("prompt helpers", () => {
  it("builds user message response", () => {
    const result = promptUserMessage("hello");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toBe("hello");
  });

  it("builds error response", () => {
    const result = promptErrorResponse("error text");
    expect(result.messages[0].content.text).toBe("error text");
  });
});
