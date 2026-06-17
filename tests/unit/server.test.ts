import { describe, expect, it, vi } from "vitest";
import { createMockContext, createOfflineContext } from "../helpers/mock-client.js";
import {
  DOCUMENTATION_RESOURCE_TEMPLATE_NAMES,
  DOCUMENTATION_STATIC_RESOURCE_NAMES,
  EXPECTED_PROMPT_NAMES,
  EXPECTED_TOOL_NAMES,
  LEGACY_ADMIN_RESOURCE_TEMPLATE_NAMES,
  LEGACY_ADMIN_STATIC_RESOURCE_NAMES,
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
    expect(server.options.instructions).toContain("list_servers");
    expect(server.options.instructions).toContain("runtime_connect_enabled");
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

  it("registers documentation resources only when offline", () => {
    const server = createMcpServer();
    const addResource = vi.spyOn(server, "addResource");
    const addResourceTemplate = vi.spyOn(server, "addResourceTemplate");

    registerMcpCapabilities(server, createOfflineContext());

    const resourceNames = addResource.mock.calls.map(([resource]) => resource.name);
    const templateNames = addResourceTemplate.mock.calls.map(([resource]) => resource.name);

    expect(resourceNames).toEqual([...DOCUMENTATION_STATIC_RESOURCE_NAMES]);
    expect(templateNames.sort()).toEqual([...DOCUMENTATION_RESOURCE_TEMPLATE_NAMES].sort());
    expect(resourceNames.length + templateNames.length).toBe(7);
  });

  it("registers legacy admin and documentation resources for a single fixed server", () => {
    const server = createMcpServer();
    const addResource = vi.spyOn(server, "addResource");
    const addResourceTemplate = vi.spyOn(server, "addResourceTemplate");

    registerMcpCapabilities(server, createMockContext({}));

    const resourceNames = addResource.mock.calls.map(([resource]) => resource.name);
    const templateNames = addResourceTemplate.mock.calls.map(([resource]) => resource.name);

    expect(resourceNames.sort()).toEqual(
      [...LEGACY_ADMIN_STATIC_RESOURCE_NAMES, ...DOCUMENTATION_STATIC_RESOURCE_NAMES].sort(),
    );
    expect(templateNames.sort()).toEqual(
      [...LEGACY_ADMIN_RESOURCE_TEMPLATE_NAMES, ...DOCUMENTATION_RESOURCE_TEMPLATE_NAMES].sort(),
    );
    expect(resourceNames.length + templateNames.length).toBe(17);
  });
});
