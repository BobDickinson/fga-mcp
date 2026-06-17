import type { FastMCP } from "fastmcp";
import {
  completeModelIds,
  completeStoreIds,
} from "../completions/index.js";
import type { ServerContext } from "../client.js";
import * as loaders from "./loaders.js";

export function registerPrompts(server: FastMCP, ctx: ServerContext): void {
  server.addPrompt({
    name: "convert_rbac_to_rebac",
    description: "Convert traditional RBAC to OpenFGA ReBAC model",
    arguments: [
      { name: "roleDescription", description: "Description of existing roles and permissions", required: true },
      { name: "migrationScope", description: "Scope of migration", enum: ["additive", "gradual", "full", "backwards-compatible"] },
    ],
    load: async ({ roleDescription, migrationScope = "additive" }) =>
      loaders.convertRbacToRebac(roleDescription!, migrationScope),
  });

  server.addPrompt({
    name: "design_model_for_domain",
    description: "Design an OpenFGA authorization model for a specific domain",
    arguments: [
      { name: "domain", description: "Application domain", required: true },
      { name: "accessPattern", enum: ["hierarchical", "flat", "hybrid", "rbac", "rebac", "abac"] },
      { name: "complexity", enum: ["simple", "moderate", "complex", "enterprise"] },
    ],
    load: async ({ domain, accessPattern = "hierarchical", complexity = "moderate" }) =>
      loaders.designModelForDomain(domain!, accessPattern, complexity),
  });

  server.addPrompt({
    name: "model_hierarchical_relationships",
    description: "Model hierarchical relationships and inheritance patterns",
    arguments: [
      { name: "hierarchyType", description: "Type of hierarchy", required: true, enum: ["organizational", "resource", "folder", "team", "group", "department"] },
      { name: "inheritancePattern", enum: ["parent-to-child", "selective", "conditional", "with-usersets"] },
    ],
    load: async ({ hierarchyType, inheritancePattern = "parent-to-child" }) =>
      loaders.modelHierarchicalRelationships(hierarchyType!, inheritancePattern),
  });

  server.addPrompt({
    name: "optimize_model_structure",
    description: "Optimize and improve an existing OpenFGA authorization model",
    arguments: [
      { name: "currentModel", description: "Existing OpenFGA DSL model", required: true },
      { name: "optimizationGoal", enum: ["performance", "maintainability", "security", "flexibility", "scalability", "readability"] },
    ],
    load: async ({ currentModel, optimizationGoal = "performance" }) =>
      loaders.optimizeModelStructure(currentModel!, optimizationGoal),
  });

  server.addPrompt({
    name: "create_model_step_by_step",
    description: "Step-by-step model creation guidance",
    arguments: [
      { name: "requirements", description: "Authorization requirements", required: true },
      { name: "complexity", enum: ["simple", "moderate", "complex", "enterprise"] },
    ],
    load: async ({ requirements, complexity = "moderate" }) =>
      loaders.createModelStepByStep(requirements!, complexity),
  });

  server.addPrompt({
    name: "design_relationship_patterns",
    description: "Design relationship patterns for a scenario",
    arguments: [
      { name: "scenario", description: "Scenario requiring relationship patterns", required: true },
      { name: "patternType", enum: ["direct", "concentric", "indirect", "conditional", "usersets", "mixed", "advanced"] },
    ],
    load: async ({ scenario, patternType = "mixed" }) =>
      loaders.designRelationshipPatterns(scenario!, patternType),
  });

  server.addPrompt({
    name: "guide_model_authoring",
    description: "Comprehensive guidance for authoring OpenFGA authorization models",
    arguments: [
      { name: "useCase", description: "Use case for the model" },
      { name: "focusArea", enum: ["getting_started", "relationships", "testing", "custom_roles", "hierarchies", "conditions", "migration", "optimization", "comprehensive"] },
    ],
    load: async ({ useCase = "general", focusArea = "comprehensive" }) =>
      loaders.guideModelAuthoring(useCase, focusArea),
  });

  server.addPrompt({
    name: "implement_custom_roles",
    description: "Implement custom roles in OpenFGA",
    arguments: [
      { name: "roleRequirements", description: "Custom role requirements", required: true },
      { name: "roleScope", enum: ["global", "resource_specific", "hybrid", "hierarchical"] },
    ],
    load: async ({ roleRequirements, roleScope = "global" }) =>
      loaders.implementCustomRoles(roleRequirements!, roleScope),
  });

  server.addPrompt({
    name: "test_model_comprehensive",
    description: "Create comprehensive test cases for an OpenFGA model",
    arguments: [
      { name: "model", description: "OpenFGA DSL model to test", required: true },
      { name: "testFocus", enum: ["permissions", "inheritance", "edge_cases", "security", "performance", "comprehensive"] },
    ],
    load: async ({ model, testFocus = "comprehensive" }) =>
      loaders.testModelComprehensive(model!, testFocus),
  });

  server.addPrompt({
    name: "audit_friendly_patterns",
    description: "Design audit-friendly authorization patterns for compliance",
    arguments: [
      { name: "auditRequirements", description: "Compliance standard", required: true, enum: ["SOC2", "HIPAA", "PCI-DSS", "GDPR", "ISO27001", "FedRAMP"] },
      { name: "auditFrequency", enum: ["monthly", "quarterly", "annual", "continuous"] },
      { name: "systemCriticality", enum: ["low", "medium", "high", "critical"] },
    ],
    load: async ({ auditRequirements, auditFrequency = "quarterly", systemCriticality = "high" }) =>
      loaders.auditFriendlyPatterns(auditRequirements!, auditFrequency, systemCriticality),
  });

  server.addPrompt({
    name: "implement_access_patterns",
    description: "Implement temporary and shared access patterns",
    arguments: [
      { name: "accessType", description: "Access pattern type", required: true, enum: ["temporary", "shared", "delegated", "conditional"] },
      { name: "businessContext", description: "Business context", required: true },
      { name: "riskLevel", enum: ["low", "medium", "high", "critical"] },
    ],
    load: async ({ accessType, businessContext, riskLevel = "medium" }) =>
      loaders.implementAccessPatterns(accessType!, businessContext!, riskLevel),
  });

  server.addPrompt({
    name: "implement_least_privilege",
    description: "Implement principle of least privilege in authorization design",
    arguments: [
      { name: "systemType", description: "Type of system", required: true, enum: ["web_app", "api", "enterprise", "microservices", "saas", "mobile"] },
      { name: "userRoles", description: "User roles and responsibilities", required: true },
      { name: "sensitiveData", description: "Types of sensitive data" },
    ],
    load: async ({ systemType, userRoles, sensitiveData = "confidential business data" }) =>
      loaders.implementLeastPrivilege(systemType!, userRoles!, sensitiveData),
  });

  server.addPrompt({
    name: "security_review_model",
    description: "Conduct a security review of an OpenFGA authorization model",
    arguments: [
      { name: "model", description: "OpenFGA DSL model to review", required: true },
      { name: "securityLevel", enum: ["standard", "high", "critical"] },
      { name: "complianceNeeds", enum: ["SOC2", "HIPAA", "PCI-DSS", "GDPR", "ISO27001", "FedRAMP"] },
    ],
    load: async ({ model, securityLevel = "standard", complianceNeeds = "SOC2" }) =>
      loaders.securityReviewModel(model!, securityLevel, complianceNeeds),
  });

  server.addPrompt({
    name: "analyze_permission_inheritance",
    description:
      "Analyze permission inheritance paths. Uses the default fixed server for store completions; does not accept connection_scope.",
    arguments: [
      { name: "user", description: "Subject in OpenFGA format, e.g. user:alice.", required: true },
      { name: "object", description: "Object in OpenFGA format, e.g. document:budget.", required: true },
      {
        name: "expectedAccess",
        description: "Expected access outcome for the analysis.",
        enum: ["should have access", "should not have access", "partial access expected", "conditional access expected"],
      },
      {
        name: "storeId",
        description: "OpenFGA store ID. Optional when the default server has default_store configured.",
        complete: async (value) => ({ values: await completeStoreIds(ctx, value) }),
      },
    ],
    load: async ({ user, object, expectedAccess = "should have access", storeId = "" }) =>
      loaders.analyzePermissionInheritance(user!, object!, expectedAccess, storeId),
  });

  server.addPrompt({
    name: "debug_permission_denial",
    description:
      "Debug why a user was denied access. Uses the default fixed server for store and model completions; does not accept connection_scope.",
    arguments: [
      { name: "user", description: "Subject in OpenFGA format, e.g. user:alice.", required: true },
      { name: "relation", description: "Relation name, e.g. reader.", required: true },
      { name: "object", description: "Object in OpenFGA format, e.g. document:budget.", required: true },
      {
        name: "storeId",
        description: "OpenFGA store ID. Optional when the default server has default_store configured.",
        complete: async (value) => ({ values: await completeStoreIds(ctx, value) }),
      },
      {
        name: "modelId",
        description: 'Authorization model ID. Optional when default_model is configured or when using "latest".',
        complete: async (value: string) => ({ values: await completeModelIds(ctx, "", value) }),
      },
    ],
    load: async ({ user, relation, object, storeId = "", modelId = "" }) =>
      loaders.debugPermissionDenial(user!, relation!, object!, storeId, modelId),
  });

  server.addPrompt({
    name: "optimize_relationship_queries",
    description: "Optimize relationship queries for better performance",
    arguments: [
      { name: "queryType", required: true, enum: ["check", "list_objects", "list_users", "expand", "read", "batch_check"] },
      { name: "performanceIssue", enum: ["slow response times", "high latency", "timeout errors", "memory usage", "CPU usage", "throughput issues", "concurrent query issues"] },
      { name: "modelComplexity", enum: ["simple", "moderate", "complex", "enterprise"] },
    ],
    load: async ({ queryType, performanceIssue = "slow response times", modelComplexity = "moderate" }) =>
      loaders.optimizeRelationshipQueries(queryType!, performanceIssue, modelComplexity),
  });

  server.addPrompt({
    name: "troubleshoot_unexpected_access",
    description:
      "Troubleshoot unexpected permission grants. Uses the default fixed server for store completions; does not accept connection_scope.",
    arguments: [
      { name: "user", description: "Subject in OpenFGA format, e.g. user:alice.", required: true },
      { name: "relation", description: "Relation name, e.g. reader.", required: true },
      { name: "object", description: "Object in OpenFGA format, e.g. document:budget.", required: true },
      {
        name: "storeId",
        description: "OpenFGA store ID. Optional when the default server has default_store configured.",
        complete: async (value) => ({ values: await completeStoreIds(ctx, value) }),
      },
    ],
    load: async ({ user, relation, object, storeId = "" }) =>
      loaders.troubleshootUnexpectedAccess(user!, relation!, object!, storeId),
  });
}
