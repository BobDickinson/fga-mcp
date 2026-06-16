import { beforeAll, afterEach, describe, expect, it } from "vitest";
import {
  analyzePermissionInheritance,
  debugPermissionDenial,
  optimizeRelationshipQueries,
  troubleshootUnexpectedAccess,
} from "../../../src/prompts/loaders.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";

beforeAll(() => {
  clearOpenFgaEnv();
});

afterEach(() => {
  clearOpenFgaEnv();
});

describe("RelationshipTroubleshootingPrompts", () => {
  it("generates debug permission denial prompt", () => {
    const result = debugPermissionDenial(
      "user:alice",
      "viewer",
      "document:budget",
      "store-123",
      "model-456",
    );
    expect(result.messages[0].content.text).toContain("user:alice");
    expect(result.messages[0].content.text).toContain("viewer");
    expect(result.messages[0].content.text).toContain("document:budget");
    expect(result.messages[0].content.text).toContain("store-123");
    expect(result.messages[0].content.text).toContain("model-456");
    expect(result.messages[0].content.text).toContain("DENIED");
  });

  it("works without store and model IDs", () => {
    const result = debugPermissionDenial("user:bob", "editor", "file:test");
    expect(result.messages[0].content.text).toContain("user:bob");
    expect(result.messages[0].content.text).toContain("editor");
    expect(result.messages[0].content.text).toContain("file:test");
  });

  it("respects restricted mode for store-specific prompts", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");
    const result = debugPermissionDenial("user:1", "viewer", "doc:1", "other-store");
    expect(result.messages[0].content.text).toContain("restricted mode");
  });

  it("generates inheritance analysis prompt", () => {
    const result = analyzePermissionInheritance(
      "user:charlie",
      "folder:documents",
      "should have access",
      "store-789",
    );
    expect(result.messages[0].content.text).toContain("user:charlie");
    expect(result.messages[0].content.text).toContain("folder:documents");
    expect(result.messages[0].content.text).toContain("should have access");
    expect(result.messages[0].content.text).toContain("store-789");
    expect(result.messages[0].content.text).toContain("inheritance");
  });

  it("uses default expected access when not specified", () => {
    const result = analyzePermissionInheritance("user:dave", "resource:test");
    expect(result.messages[0].content.text).toContain("should have access");
  });

  it("generates query optimization prompt", () => {
    const result = optimizeRelationshipQueries("list_objects", "high latency", "complex");
    expect(result.messages[0].content.text).toContain("list_objects");
    expect(result.messages[0].content.text).toContain("high latency");
    expect(result.messages[0].content.text).toContain("complex");
    expect(result.messages[0].content.text).toContain("Optimize");
  });

  it("uses default values when not specified", () => {
    const result = optimizeRelationshipQueries("check");
    expect(result.messages[0].content.text).toContain("slow response times");
    expect(result.messages[0].content.text).toContain("moderate");
  });

  it("generates unexpected access troubleshooting prompt", () => {
    const result = troubleshootUnexpectedAccess("user:eve", "admin", "system:config", "store-secure");
    expect(result.messages[0].content.text).toContain("user:eve");
    expect(result.messages[0].content.text).toContain("admin");
    expect(result.messages[0].content.text).toContain("system:config");
    expect(result.messages[0].content.text).toContain("store-secure");
    expect(result.messages[0].content.text).toContain("should NOT");
  });

  it("works without store ID", () => {
    const result = troubleshootUnexpectedAccess("user:frank", "write", "data:sensitive");
    expect(result.messages[0].content.text).toContain("user:frank");
    expect(result.messages[0].content.text).toContain("write");
    expect(result.messages[0].content.text).toContain("data:sensitive");
  });
});
