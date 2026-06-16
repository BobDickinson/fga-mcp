import { afterEach, describe, expect, it } from "vitest";
import {
  analyzePermissionInheritance,
  convertRbacToRebac,
  debugPermissionDenial,
  designModelForDomain,
  implementLeastPrivilege,
  securityReviewModel,
} from "../../../src/prompts/loaders.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";

afterEach(() => {
  clearOpenFgaEnv();
});

describe("Prompts Integration", () => {
  it("ModelDesignPrompts can generate domain-specific prompts", () => {
    const result = designModelForDomain("healthcare", "hierarchical", "complex");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("healthcare");
    expect(result.messages[0].content.text).toContain("OpenFGA");
  });

  it("ModelDesignPrompts can generate RBAC conversion prompts", () => {
    const roleDescription = "Admin, Manager, User roles with read/write permissions";
    const result = convertRbacToRebac(roleDescription);
    expect(result.messages[0].content.text).toContain(roleDescription);
    expect(result.messages[0].content.text).toContain("RBAC");
    expect(result.messages[0].content.text).toContain("ReBAC");
  });

  it("RelationshipTroubleshootingPrompts can debug permission issues", () => {
    const result = debugPermissionDenial("user:testuser", "viewer", "document:test");
    expect(result.messages[0].content.text).toContain("user:testuser");
    expect(result.messages[0].content.text).toContain("viewer");
    expect(result.messages[0].content.text).toContain("document:test");
    expect(result.messages[0].content.text).toContain("DENIED");
  });

  it("RelationshipTroubleshootingPrompts can analyze inheritance", () => {
    const result = analyzePermissionInheritance("user:manager", "folder:project");
    expect(result.messages[0].content.text).toContain("inheritance");
    expect(result.messages[0].content.text).toContain("user:manager");
    expect(result.messages[0].content.text).toContain("folder:project");
  });

  it("SecurityGuidancePrompts can generate security reviews", () => {
    const testModel = `model
  schema 1.1

type user

type document
  relations
    define reader: [user]
    define writer: [user]`;
    const result = securityReviewModel(testModel, "high", "SOC2");
    expect(result.messages[0].content.text).toContain(testModel);
    expect(result.messages[0].content.text).toContain("security review");
    expect(result.messages[0].content.text).toContain("SOC2");
  });

  it("SecurityGuidancePrompts can generate least privilege guidance", () => {
    const userRoles = "Developer, QA, DevOps roles";
    const result = implementLeastPrivilege("microservices", userRoles);
    expect(result.messages[0].content.text).toContain("least privilege");
    expect(result.messages[0].content.text).toContain("microservices");
    expect(result.messages[0].content.text).toContain(userRoles);
  });

  it("all prompts respect restricted mode", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");

    const result1 = designModelForDomain("test");
    expect(result1.messages[0].role).toBe("user");
    expect(result1.messages[0].content.text).toContain("OpenFGA");

    const result2 = debugPermissionDenial("user:test", "viewer", "doc:test", "different-store");
    expect(result2.messages[0].content.text).toContain("restricted mode");

    const result3 = securityReviewModel("test model");
    expect(result3.messages[0].role).toBe("user");
    expect(result3.messages[0].content.text).toContain("security review");
  });

  it("prompts work correctly when restricted mode allows access", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    setEnv("OPENFGA_MCP_API_STORE", "allowed-store");

    const result = debugPermissionDenial("user:test", "viewer", "doc:test", "allowed-store");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).not.toContain("restricted mode");
  });
});
