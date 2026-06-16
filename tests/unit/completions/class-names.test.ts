import { beforeAll, describe, expect, it } from "vitest";
import { completeClassNames } from "../../../src/completions/index.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("completeClassNames", () => {
  const index = getDocumentationIndex();
  const sdk = index.getSdkList()[0];

  it("returns array for empty input", () => {
    const completions = completeClassNames(sdk, "");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("filters classes based on current value", () => {
    const overview = index.getSdkOverview(sdk);
    if (!overview || overview.classes.length === 0) return;
    const prefix = overview.classes[0].slice(0, 6);
    const completions = completeClassNames(sdk, prefix);
    expect(completions.length).toBeGreaterThan(0);
    expect(completions.every((c) => c.toLowerCase().startsWith(prefix.toLowerCase()))).toBe(true);
  });

  it("handles case-insensitive filtering", () => {
    const overview = index.getSdkOverview(sdk);
    if (!overview || overview.classes.length === 0) return;
    const prefix = overview.classes[0].slice(0, 4);
    const lower = completeClassNames(sdk, prefix.toLowerCase());
    const upper = completeClassNames(sdk, prefix.toUpperCase());
    expect(lower).toEqual(upper);
  });

  it("returns consistent results across multiple calls", () => {
    const first = completeClassNames(sdk, "Client");
    const second = completeClassNames(sdk, "Client");
    expect(first).toEqual(second);
  });

  it("handles special characters in input", () => {
    const completions = completeClassNames(sdk, "OpenFGA_Client");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles very long input strings", () => {
    const completions = completeClassNames(sdk, "A".repeat(200));
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles whitespace in input", () => {
    const completions = completeClassNames(sdk, "  Client  ");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("returns array even with numeric input", () => {
    const completions = completeClassNames(sdk, "123");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("returns empty array for invalid SDK", () => {
    const completions = completeClassNames("definitely_invalid_sdk_name_123", "Client");
    expect(completions).toEqual([]);
  });
});
