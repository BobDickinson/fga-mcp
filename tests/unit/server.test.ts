import { describe, expect, it, vi } from "vitest";
import { createOfflineContext } from "../helpers/mock-client.js";
import {
  EXPECTED_PROMPT_NAMES,
  EXPECTED_RESOURCE_TEMPLATE_NAMES,
  EXPECTED_STATIC_RESOURCE_NAMES,
  EXPECTED_TOOL_NAMES,
  SERVER_NAME,
  SERVER_VERSION,
  createMcpServer,
  registerMcpCapabilities,
} from "../../src/server.js";

describe("MCP server bootstrap", () => {
  it("creates a server with expected metadata", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
    expect(server.options.name).toBe(SERVER_NAME);
    expect(server.options.version).toBe(SERVER_VERSION);
    expect(server.options.instructions).toContain("OpenFGA MCP Server");
  });

  it("registers all expected tools", () => {
    const server = createMcpServer();
    const addTool = vi.spyOn(server, "addTool");

    registerMcpCapabilities(server, createOfflineContext());

    const registeredTools = addTool.mock.calls.map(([tool]) => tool.name);
    for (const toolName of EXPECTED_TOOL_NAMES) {
      expect(registeredTools).toContain(toolName);
    }
    expect(registeredTools).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it("registers all expected prompts", () => {
    const server = createMcpServer();
    const addPrompt = vi.spyOn(server, "addPrompt");

    registerMcpCapabilities(server, createOfflineContext());

    const registeredPrompts = addPrompt.mock.calls.map(([prompt]) => prompt.name);
    for (const promptName of EXPECTED_PROMPT_NAMES) {
      expect(registeredPrompts).toContain(promptName);
    }
    expect(registeredPrompts).toHaveLength(EXPECTED_PROMPT_NAMES.length);
  });

  it("registers exactly 2 static resources and 15 resource templates (17 total endpoints)", () => {
    const server = createMcpServer();
    const addResource = vi.spyOn(server, "addResource");
    const addResourceTemplate = vi.spyOn(server, "addResourceTemplate");

    registerMcpCapabilities(server, createOfflineContext());

    const resourceNames = addResource.mock.calls.map(([resource]) => resource.name);
    const templateNames = addResourceTemplate.mock.calls.map(([resource]) => resource.name);

    expect(resourceNames).toHaveLength(EXPECTED_STATIC_RESOURCE_NAMES.length);
    expect(templateNames).toHaveLength(EXPECTED_RESOURCE_TEMPLATE_NAMES.length);
    expect(resourceNames.length + templateNames.length).toBe(17);

    for (const resourceName of EXPECTED_STATIC_RESOURCE_NAMES) {
      expect(resourceNames).toContain(resourceName);
    }

    for (const templateName of EXPECTED_RESOURCE_TEMPLATE_NAMES) {
      expect(templateNames).toContain(templateName);
    }

    expect(resourceNames.sort()).toEqual([...EXPECTED_STATIC_RESOURCE_NAMES].sort());
    expect(templateNames.sort()).toEqual([...EXPECTED_RESOURCE_TEMPLATE_NAMES].sort());
  });
});
