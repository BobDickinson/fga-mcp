import { afterEach, describe, expect, it } from "vitest";
import {
  checkOfflineMode,
  checkOfflineModeResource,
  checkRestrictedMode,
  checkRestrictedModeForWrites,
  checkRestrictedModePrompt,
  checkRestrictedModeResource,
  checkWritePermission,
  isRestrictedMode,
  isWriteEnabled,
  promptErrorResponse,
  promptUserMessage,
} from "../../src/guards.js";
import { createMockContext, createOfflineContext } from "../helpers/mock-client.js";
import { clearOpenFgaEnv, setEnv } from "../helpers/env.js";
import type { ServerPolicy } from "../../src/server-pool.js";

afterEach(() => {
  clearOpenFgaEnv();
});

const openPolicy: ServerPolicy = { restrict: false, writeable: true };
const readOnlyPolicy: ServerPolicy = { restrict: false, writeable: false };
const restrictedStorePolicy: ServerPolicy = {
  restrict: true,
  writeable: false,
  defaultStore: "allowed-store",
};
const restrictedModelPolicy: ServerPolicy = {
  restrict: true,
  writeable: false,
  defaultModel: "allowed-model",
};
const restrictedBothPolicy: ServerPolicy = {
  restrict: true,
  writeable: false,
  defaultStore: "allowed-store",
  defaultModel: "allowed-model",
};

describe("checkOfflineMode", () => {
  it("returns null when online", () => {
    expect(checkOfflineMode(createMockContext({}), "Test Operation")).toBeNull();
  });

  it("returns error when offline", () => {
    const result = checkOfflineMode(createOfflineContext(), "Test Operation");
    expect(result).toContain("Test Operation");
    expect(result).toContain("OPENFGA_MCP_API_URL");
    expect(result).toContain("FGA config file");
  });

  it("returns error with custom operation name", () => {
    const result = checkOfflineMode(createOfflineContext(), "Fetching authorization models");
    expect(result).toContain("Fetching authorization models");
    expect(result).toContain("requires a live OpenFGA instance");
  });
});

describe("checkWritePermission", () => {
  it("blocks when write disabled on server policy", () => {
    expect(checkWritePermission(readOnlyPolicy, "create stores")).toContain("Write operations are disabled");
  });

  it("includes operation name and FGA config hint", () => {
    const result = checkWritePermission(readOnlyPolicy, "grant permissions");
    expect(result).toContain("grant permissions");
    expect(result).toContain("writeable: true");
  });

  it("allows when writeable", () => {
    expect(checkWritePermission(openPolicy, "create stores")).toBeNull();
  });
});

describe("checkRestrictedMode", () => {
  it("returns null when restrict is disabled", () => {
    expect(checkRestrictedMode(openPolicy, "any-store", "any-model")).toBeNull();
  });

  it("blocks non-allowed store when restrict pins store", () => {
    expect(checkRestrictedMode(restrictedStorePolicy, "other-store")).toContain("allowed-store");
    expect(checkRestrictedMode(restrictedStorePolicy, "other-store")).toContain("Restricted: store must be");
  });

  it("returns null when querying the configured store", () => {
    expect(checkRestrictedMode(restrictedStorePolicy, "allowed-store", null)).toBeNull();
  });

  it("returns null when no store pin is configured", () => {
    const policy: ServerPolicy = { restrict: true, writeable: false };
    expect(checkRestrictedMode(policy, "any-store", null)).toBeNull();
  });

  it("returns null when store ID is null", () => {
    expect(checkRestrictedMode(restrictedStorePolicy, null, null)).toBeNull();
  });

  it("blocks non-allowed model when model pin configured", () => {
    expect(checkRestrictedMode(restrictedModelPolicy, "store", "other-model")).toContain("allowed-model");
    expect(checkRestrictedMode(restrictedModelPolicy, "store", "other-model")).toContain("Restricted: model must be");
  });

  it("returns null when querying the configured model", () => {
    expect(checkRestrictedMode(restrictedModelPolicy, null, "allowed-model")).toBeNull();
  });

  it("returns null when no model pin is configured", () => {
    const policy: ServerPolicy = { restrict: true, writeable: false };
    expect(checkRestrictedMode(policy, null, "any-model")).toBeNull();
  });

  it("returns null when model ID is null", () => {
    expect(checkRestrictedMode(restrictedModelPolicy, null, null)).toBeNull();
  });

  it("returns null when both store and model match", () => {
    expect(checkRestrictedMode(restrictedBothPolicy, "allowed-store", "allowed-model")).toBeNull();
  });

  it("returns store error first when both do not match", () => {
    const result = checkRestrictedMode(restrictedBothPolicy, "wrong-store", "wrong-model");
    expect(result).toContain("allowed-store");
    expect(result).not.toContain("allowed-model");
  });

  it("allows partial restrictions — store pin only", () => {
    expect(checkRestrictedMode(restrictedStorePolicy, "allowed-store", "any-model")).toBeNull();
  });

  it("allows partial restrictions — model pin only", () => {
    expect(checkRestrictedMode(restrictedModelPolicy, "any-store", "allowed-model")).toBeNull();
  });

  it("handles special characters in store names", () => {
    const policy: ServerPolicy = {
      restrict: true,
      writeable: false,
      defaultStore: "store-with-special_chars.123",
    };
    expect(checkRestrictedMode(policy, "store-with-special_chars.123", null)).toBeNull();
    expect(checkRestrictedMode(policy, "different-store", null)).toContain("store-with-special_chars.123");
  });

  it("handles case-sensitive store comparisons", () => {
    const policy: ServerPolicy = { restrict: true, writeable: false, defaultStore: "MyStore" };
    expect(checkRestrictedMode(policy, "mystore", null)).toContain("MyStore");
    expect(checkRestrictedMode(policy, "MyStore", null)).toBeNull();
  });

  it("treats whitespace store pin as a literal pin", () => {
    const policy: ServerPolicy = { restrict: true, writeable: false, defaultStore: " " };
    expect(checkRestrictedMode(policy, "any-store", null)).toContain("Restricted: store must be");
  });
});

describe("checkRestrictedModeForWrites", () => {
  it("does not block writes (decoupled from restrict)", () => {
    expect(checkRestrictedModeForWrites("create stores")).toBeNull();
  });
});

describe("resource guard variants", () => {
  it("returns null when online", () => {
    expect(checkOfflineModeResource(createMockContext({}), "Listing stores")).toBeNull();
  });

  it("returns error object for offline resource", () => {
    const result = checkOfflineModeResource(createOfflineContext(), "Listing stores");
    expect(result).toEqual({ error: expect.stringContaining("Listing stores") });
  });

  it("returns null for allowed store on restricted resource", () => {
    expect(checkRestrictedModeResource(restrictedStorePolicy, "allowed-store")).toBeNull();
  });

  it("returns error object for restricted resource", () => {
    const result = checkRestrictedModeResource(restrictedStorePolicy, "other-store");
    expect(result?.error).toContain("allowed-store");
  });
});

describe("prompt guard variants", () => {
  it("blocks prompt for wrong store via explicit policy", () => {
    expect(checkRestrictedModePrompt("other-store", null, restrictedStorePolicy)).toContain("access guidance");
  });

  it("allows prompt for configured store via explicit policy", () => {
    expect(checkRestrictedModePrompt("allowed-store", null, restrictedStorePolicy)).toBeNull();
  });

  it("blocks prompt for wrong model via explicit policy", () => {
    expect(checkRestrictedModePrompt(null, "other-model", restrictedModelPolicy)).toContain("authorization models");
  });

  it("blocks prompt for wrong store in restricted mode via env legacy", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    expect(checkRestrictedModePrompt("other-store")).toContain("access guidance");
  });

  it("allows prompt when legacy restrict env is not true", () => {
    for (const value of ["yes", "1", "TRUE", "false"]) {
      setEnv("OPENFGA_MCP_API_RESTRICT", value);
      setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
      expect(checkRestrictedModePrompt("other-store")).toBeNull();
    }
  });

  it("returns null when legacy restrict is on but no store pin configured", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    expect(checkRestrictedModePrompt("any-store")).toBeNull();
  });
});

describe("legacy env helpers", () => {
  it("isRestrictedMode reads OPENFGA_MCP_API_RESTRICT", () => {
    expect(isRestrictedMode()).toBe(false);
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    expect(isRestrictedMode()).toBe(true);
  });

  it("isWriteEnabled reads OPENFGA_MCP_API_WRITEABLE", () => {
    expect(isWriteEnabled()).toBe(false);
    setEnv("OPENFGA_MCP_API_WRITEABLE", "true");
    expect(isWriteEnabled()).toBe(true);
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

  it("uses fallback text for null error", () => {
    const result = promptErrorResponse(null);
    expect(result.messages[0].content.text).toBe("Unknown error");
  });
});
