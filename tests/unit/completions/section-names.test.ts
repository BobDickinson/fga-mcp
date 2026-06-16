import { beforeAll, describe, expect, it } from "vitest";
import { completeSectionNames } from "../../../src/completions/index.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("completeSectionNames", () => {
  const index = getDocumentationIndex();
  const sdk = index.getSdkList()[0];

  it("handles documentation initialization gracefully", () => {
    const completions = completeSectionNames(sdk, "");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles filtering with current value", () => {
    const completions = completeSectionNames(sdk, "api");
    expect(Array.isArray(completions)).toBe(true);
    if (completions.length > 0) {
      expect(completions.every((s) => s.toLowerCase().startsWith("api"))).toBe(true);
    }
  });

  it("handles case-insensitive filtering", () => {
    const lower = completeSectionNames(sdk, "getting");
    const upper = completeSectionNames(sdk, "GETTING");
    expect(lower).toEqual(upper);
  });

  it("handles various section name patterns", () => {
    const testCases = ["api", "getting", "config", "tutorial", "guide", "example"];
    for (const input of testCases) {
      expect(Array.isArray(completeSectionNames(sdk, input))).toBe(true);
    }
  });

  it("handles empty current value", () => {
    const completions = completeSectionNames(sdk, "");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles no matches found scenario", () => {
    const completions = completeSectionNames(sdk, "xyz123nonexistent");
    expect(completions).toEqual([]);
  });

  it("handles exceptions gracefully", () => {
    const completions = completeSectionNames(sdk, "test");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles empty and whitespace input", () => {
    expect(Array.isArray(completeSectionNames(sdk, ""))).toBe(true);
    expect(Array.isArray(completeSectionNames(sdk, " "))).toBe(true);
    expect(Array.isArray(completeSectionNames(sdk, "\t"))).toBe(true);
  });

  it("handles long input strings", () => {
    const completions = completeSectionNames(sdk, "section".repeat(100));
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles unicode characters in input", () => {
    const completions = completeSectionNames(sdk, "configuración");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("maintains result consistency across multiple calls", () => {
    const first = completeSectionNames(sdk, "getting");
    const second = completeSectionNames(sdk, "getting");
    expect(first).toEqual(second);
  });

  it("handles hyphenated section names", () => {
    const completions = completeSectionNames(sdk, "getting-started");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles underscored section names", () => {
    const completions = completeSectionNames(sdk, "api_reference");
    expect(Array.isArray(completions)).toBe(true);
  });
});
