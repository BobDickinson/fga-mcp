import { beforeAll, afterEach, describe, expect, it } from "vitest";
import {
  auditFriendlyPatterns,
  implementAccessPatterns,
  implementLeastPrivilege,
  securityReviewModel,
} from "../../../src/prompts/loaders.js";
import { clearOpenFgaEnv, setEnv } from "../../helpers/env.js";

beforeAll(() => {
  clearOpenFgaEnv();
});

afterEach(() => {
  clearOpenFgaEnv();
});

describe("SecurityGuidancePrompts", () => {
  it("generates security review prompt", () => {
    const model = "type user\ntype document";
    const result = securityReviewModel(model, "high", "HIPAA");
    expect(result.messages[0].content.text).toContain(model);
    expect(result.messages[0].content.text).toContain("high");
    expect(result.messages[0].content.text).toContain("HIPAA");
    expect(result.messages[0].content.text).toContain("security review");
  });

  it("uses default security level and compliance", () => {
    const result = securityReviewModel("basic model");
    expect(result.messages[0].content.text).toContain("standard");
    expect(result.messages[0].content.text).toContain("SOC2");
  });

  it("respects restricted mode when configured", () => {
    setEnv("OPENFGA_MCP_API_RESTRICT", "true");
    const result = securityReviewModel("test model");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("test model");
  });

  it("generates least privilege prompt", () => {
    const userRoles = "Admin, Manager, Employee with specific responsibilities";
    const result = implementLeastPrivilege("web app", userRoles, "personal health information");
    expect(result.messages[0].content.text).toContain("web app");
    expect(result.messages[0].content.text).toContain(userRoles);
    expect(result.messages[0].content.text).toContain("personal health information");
    expect(result.messages[0].content.text).toContain("least privilege");
  });

  it("uses default sensitive data description", () => {
    const result = implementLeastPrivilege("API", "Basic roles");
    expect(result.messages[0].content.text).toContain("confidential business data");
  });

  it("generates audit-friendly patterns prompt", () => {
    const result = auditFriendlyPatterns("SOX", "monthly", "critical");
    expect(result.messages[0].content.text).toContain("SOX");
    expect(result.messages[0].content.text).toContain("monthly");
    expect(result.messages[0].content.text).toContain("critical");
    expect(result.messages[0].content.text).toContain("audit-friendly");
  });

  it("uses default frequency and criticality", () => {
    const result = auditFriendlyPatterns("PCI-DSS");
    expect(result.messages[0].content.text).toContain("quarterly");
    expect(result.messages[0].content.text).toContain("high");
  });

  it("generates access patterns prompt", () => {
    const result = implementAccessPatterns("temporary", "contractor onboarding", "high");
    expect(result.messages[0].content.text).toContain("temporary");
    expect(result.messages[0].content.text).toContain("contractor onboarding");
    expect(result.messages[0].content.text).toContain("high");
    expect(result.messages[0].content.text).toContain("access");
  });

  it("uses default risk level", () => {
    const result = implementAccessPatterns("shared", "role transition");
    expect(result.messages[0].content.text).toContain("medium");
  });
});
