import { checkRestrictedModePrompt, promptErrorResponse, promptUserMessage } from "../guards.js";

function restrictedOrPrompt(storeId?: string, modelId?: string) {
  const error = checkRestrictedModePrompt(storeId || undefined, modelId || undefined);
  return error ? promptErrorResponse(error) : null;
}

export function convertRbacToRebac(roleDescription: string, migrationScope = "additive") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Convert the following RBAC (Role-Based Access Control) system to OpenFGA's ReBAC (Relationship-Based Access Control) model.

**Existing RBAC System:**
${roleDescription}

**Migration Scope:** ${migrationScope}

Please provide RBAC analysis, ReBAC mapping, OpenFGA DSL model (schema 1.1), migration strategy, relationship tuples, and custom roles guidance.`);
}

export function designModelForDomain(domain: string, accessPattern = "hierarchical", complexity = "moderate") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Design an OpenFGA authorization model for a ${domain} application using a ${accessPattern} access control pattern at ${complexity} complexity level. Provide type definitions, relations, DSL, example tuples, permissions, and security considerations.`);
}

export function modelHierarchicalRelationships(hierarchyType: string, inheritancePattern = "parent-to-child") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Design hierarchical relationships for a ${hierarchyType} hierarchy using ${inheritancePattern} inheritance in OpenFGA. Provide hierarchy design, inheritance rules, DSL, permission propagation examples, edge cases, and performance considerations.`);
}

export function optimizeModelStructure(currentModel: string, optimizationGoal = "performance") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Analyze and optimize the following OpenFGA authorization model with a focus on ${optimizationGoal}:

\`\`\`
${currentModel}
\`\`\`

Provide current analysis, optimization opportunities, improved model, performance impact, migration plan, and validation strategy.`);
}

export function createModelStepByStep(requirements: string, complexity = "moderate") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Guide through creating an OpenFGA authorization model step-by-step for:

**Requirements:** ${requirements}
**Complexity Level:** ${complexity}

Provide steps for identifying types, defining relations, modeling relationships, adding permissions, test coverage, and optimization.`);
}

export function designRelationshipPatterns(scenario: string, patternType = "mixed") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Design relationship patterns for OpenFGA scenario: ${scenario}. Focus on ${patternType} patterns with DSL implementation, examples, query patterns, and trade-offs.`);
}

export function guideModelAuthoring(useCase = "general", focusArea = "comprehensive") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Provide OpenFGA model authoring guidance for use case "${useCase}" with focus on "${focusArea}". Include recommendations, best practices, example DSL, pitfalls, and testing strategies.`);
}

export function implementCustomRoles(roleRequirements: string, roleScope = "global") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Design custom roles implementation for OpenFGA with requirements: ${roleRequirements}. Role scope: ${roleScope}. Provide role model design, permission assignment, user assignment, role management, migration strategy, and example tuples.`);
}

export function testModelComprehensive(model: string, testFocus = "comprehensive") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Create comprehensive test cases for the OpenFGA model with focus on ${testFocus}:

\`\`\`dsl
${model}
\`\`\`

Provide a complete .fga.yaml file, test scenarios, organization, and validation strategy.`);
}

export function auditFriendlyPatterns(auditRequirements: string, auditFrequency = "quarterly", systemCriticality = "high") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Design audit-friendly authorization patterns in OpenFGA for ${auditRequirements} compliance (${auditFrequency} audits, ${systemCriticality} criticality). Cover audit trail design, compliance mapping, access documentation, segregation of duties, reporting, and continuous compliance.`);
}

export function implementAccessPatterns(accessType: string, businessContext: string, riskLevel = "medium") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Implement secure ${accessType} access patterns using OpenFGA for ${businessContext} (${riskLevel} risk). Cover relationship patterns, conditional relations, model design, custom roles, hierarchical patterns, security controls, lifecycle management, and testing.`);
}

export function implementLeastPrivilege(systemType: string, userRoles: string, sensitiveData = "confidential business data") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Design an OpenFGA authorization model implementing least privilege for a ${systemType} system. User roles: ${userRoles}. Sensitive data: ${sensitiveData}. Cover minimal permissions, granular relations, controlled inheritance, and testing.`);
}

export function securityReviewModel(model: string, securityLevel = "standard", complianceNeeds = "SOC2") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Conduct a comprehensive security review of this OpenFGA model (${securityLevel} security, ${complianceNeeds} compliance):

\`\`\`
${model}
\`\`\`

Analyze vulnerabilities, least privilege, separation of duties, inheritance security, administrative access, compliance alignment, threat modeling, and remediation recommendations.`);
}

export function analyzePermissionInheritance(user: string, object: string, expectedAccess = "should have access", storeId = "") {
  const blocked = restrictedOrPrompt(storeId || undefined);
  if (blocked) return blocked;
  return promptUserMessage(`Analyze permission inheritance paths: user ${user}, object ${object}, expected: user ${expectedAccess}${storeId ? `\nStore ID: ${storeId}` : ""}. Provide direct relationships, inheritance chain analysis, group memberships, hierarchical permissions, conditional access, visualization, and troubleshooting recommendations.`);
}

export function debugPermissionDenial(user: string, relation: string, object: string, storeId = "", modelId = "") {
  const blocked = restrictedOrPrompt(storeId || undefined, modelId || undefined);
  if (blocked) return blocked;
  return promptUserMessage(`Debug permission denial: user ${user}, relation ${relation}, object ${object}${storeId ? `, store ${storeId}` : ""}${modelId ? `, model ${modelId}` : ""}. Result: Permission DENIED. Provide systematic debugging steps, relationship analysis, model verification, inheritance investigation, common issues, debugging commands, and resolution steps.`);
}

export function optimizeRelationshipQueries(queryType: string, performanceIssue = "slow response times", modelComplexity = "moderate") {
  const blocked = restrictedOrPrompt();
  if (blocked) return blocked;
  return promptUserMessage(`Optimize OpenFGA ${queryType} queries experiencing ${performanceIssue} with ${modelComplexity} model complexity. Cover query pattern analysis, model optimization, query structure improvements, relationship design, monitoring, scaling strategies, and best practices.`);
}

export function troubleshootUnexpectedAccess(user: string, relation: string, object: string, storeId = "") {
  const blocked = restrictedOrPrompt(storeId || undefined);
  if (blocked) return blocked;
  return promptUserMessage(`Investigate unexpected access: user ${user} has ${relation} on ${object} but should NOT${storeId ? ` (store ${storeId})` : ""}. Provide direct relationship audit, inheritance investigation, group membership analysis, model security review, recent changes, security hardening, and compliance check.`);
}
