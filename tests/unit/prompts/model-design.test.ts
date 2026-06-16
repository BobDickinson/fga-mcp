import { beforeAll, describe, expect, it } from "vitest";
import {
  convertRbacToRebac,
  createModelStepByStep,
  designModelForDomain,
  designRelationshipPatterns,
  guideModelAuthoring,
  implementCustomRoles,
  modelHierarchicalRelationships,
  optimizeModelStructure,
  testModelComprehensive,
} from "../../../src/prompts/loaders.js";
import { clearOpenFgaEnv } from "../../helpers/env.js";

beforeAll(() => {
  clearOpenFgaEnv();
});

describe("ModelDesignPrompts", () => {
  it("generates domain-specific model design prompt", () => {
    const result = designModelForDomain("document management", "hierarchical", "moderate");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("document management");
    expect(result.messages[0].content.text).toContain("hierarchical");
  });

  it("uses default parameters", () => {
    const result = designModelForDomain("e-commerce");
    expect(result.messages[0].content.text).toContain("e-commerce");
    expect(result.messages[0].content.text).toContain("hierarchical");
    expect(result.messages[0].content.text).toContain("moderate");
  });

  it("generates RBAC to ReBAC conversion prompt", () => {
    const roleDescription = "Admin, Manager, User roles with hierarchical permissions";
    const result = convertRbacToRebac(roleDescription, "gradual");
    expect(result.messages[0].content.text).toContain(roleDescription);
    expect(result.messages[0].content.text).toContain("gradual");
    expect(result.messages[0].content.text).toContain("RBAC");
    expect(result.messages[0].content.text).toContain("ReBAC");
  });

  it("generates hierarchical relationship prompt", () => {
    const result = modelHierarchicalRelationships("organizational", "parent-to-child");
    expect(result.messages[0].content.text).toContain("organizational");
    expect(result.messages[0].content.text).toContain("parent-to-child");
  });

  it("generates optimization prompt", () => {
    const result = optimizeModelStructure("type user", "security");
    expect(result.messages[0].content.text).toContain("type user");
    expect(result.messages[0].content.text).toContain("security");
  });
});

describe("AuthoringGuidancePrompts", () => {
  it("generates authoring guidance prompt", () => {
    const result = guideModelAuthoring("healthcare", "relationships");
    expect(result.messages[0].content.text).toContain("healthcare");
    expect(result.messages[0].content.text).toContain("relationships");
    expect(result.messages[0].content.text).toContain("OpenFGA");
  });

  it("uses default parameters when not specified", () => {
    const result = guideModelAuthoring();
    expect(result.messages[0].content.text).toContain("general");
    expect(result.messages[0].content.text).toContain("comprehensive");
  });

  it("generates step-by-step model creation prompt", () => {
    const requirements = "Multi-tenant SaaS with role-based access";
    const result = createModelStepByStep(requirements, "complex");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain(requirements);
    expect(result.messages[0].content.text).toContain("complex");
    expect(result.messages[0].content.text).toContain("step-by-step");
  });

  it("uses moderate complexity by default for step-by-step", () => {
    const result = createModelStepByStep("Simple app");
    expect(result.messages[0].content.text).toContain("moderate");
  });

  it("generates relationship pattern design prompt", () => {
    const scenario = "Hierarchical document management with inheritance";
    const result = designRelationshipPatterns(scenario, "indirect");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain(scenario);
    expect(result.messages[0].content.text).toContain("indirect");
  });

  it("uses mixed pattern type by default", () => {
    const result = designRelationshipPatterns("Basic scenario");
    expect(result.messages[0].content.text).toContain("mixed");
  });

  it("generates custom roles implementation prompt", () => {
    const roleRequirements = "Dynamic roles with permission templates";
    const result = implementCustomRoles(roleRequirements, "resource_specific");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain(roleRequirements);
    expect(result.messages[0].content.text).toContain("resource_specific");
    expect(result.messages[0].content.text).toContain("custom roles");
  });

  it("uses global role scope by default", () => {
    const result = implementCustomRoles("Basic roles");
    expect(result.messages[0].content.text).toContain("global");
  });

  it("generates comprehensive test generation prompt", () => {
    const model = "model\n  schema 1.1\ntype user\ntype document";
    const result = testModelComprehensive(model, "security");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain(model);
    expect(result.messages[0].content.text).toContain("security");
    expect(result.messages[0].content.text).toContain(".fga.yaml");
  });

  it("uses comprehensive test focus by default", () => {
    const result = testModelComprehensive("basic model");
    expect(result.messages[0].content.text).toContain("comprehensive");
  });
});
