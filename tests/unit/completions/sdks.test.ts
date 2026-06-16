import { beforeAll, describe, expect, it } from "vitest";
import { completeSdks } from "../../../src/completions/index.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("completeSdks", () => {
  it("returns SDK completions including guides", () => {
    const result = completeSdks("");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("general");
    expect(result).toContain("authoring");
  });

  it("filters SDK completions", () => {
    const result = completeSdks("p");
    expect(result.some((s) => s.startsWith("p"))).toBe(true);
  });

  it("handles empty current value properly", () => {
    const completions = completeSdks("");
    expect(Array.isArray(completions)).toBe(true);
    expect(completions.length).toBeGreaterThan(0);
  });

  it("handles filtering with current value", () => {
    const completions = completeSdks("p");
    expect(Array.isArray(completions)).toBe(true);
    expect(completions.every((s) => s.toLowerCase().startsWith("p"))).toBe(true);
  });

  it("handles case-insensitive filtering", () => {
    const lower = completeSdks("php");
    const upper = completeSdks("PHP");
    expect(lower).toEqual(upper);
  });

  it("handles various input patterns", () => {
    const testCases = ["g", "go", "general", "auth", "authoring", "java", "js"];
    for (const input of testCases) {
      expect(Array.isArray(completeSdks(input))).toBe(true);
    }
  });

  it("handles no matches found scenario", () => {
    const completions = completeSdks("xyz");
    expect(completions).toEqual([]);
  });

  it("handles exceptions gracefully", () => {
    const completions = completeSdks("test");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles empty and whitespace input", () => {
    expect(Array.isArray(completeSdks(""))).toBe(true);
    expect(Array.isArray(completeSdks(" "))).toBe(true);
    expect(Array.isArray(completeSdks("\t"))).toBe(true);
  });

  it("handles long input strings", () => {
    const completions = completeSdks("php".repeat(100));
    expect(Array.isArray(completions)).toBe(true);
  });

  it("handles unicode characters in input", () => {
    const completions = completeSdks("phé");
    expect(Array.isArray(completions)).toBe(true);
  });

  it("maintains result consistency across multiple calls", () => {
    const first = completeSdks("p");
    const second = completeSdks("p");
    expect(first).toEqual(second);
  });
});
