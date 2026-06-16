import { beforeAll, describe, expect, it } from "vitest";
import { completeMethodNames } from "../../../src/completions/index.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

function findClassWithMethods(): { sdk: string; className: string } | null {
  const index = getDocumentationIndex();
  for (const sdk of index.getSdkList()) {
    const overview = index.getSdkOverview(sdk);
    for (const className of overview?.classes ?? []) {
      const classDoc = index.getClassDocumentation(sdk, className);
      if (classDoc && Object.keys(classDoc.methods).length > 0) {
        return { sdk, className };
      }
    }
  }
  return null;
}

describe("completeMethodNames", () => {
  const index = getDocumentationIndex();
  const withMethods = findClassWithMethods();
  const sdk = withMethods?.sdk ?? index.getSdkList()[0];
  const className = withMethods?.className ?? "";

  it("returns empty array when SDK is invalid", () => {
    const completions = completeMethodNames("invalid_sdk", "SomeClass", "");
    expect(completions).toEqual([]);
  });

  it("returns empty array when class name is invalid", () => {
    const completions = completeMethodNames(sdk, "NonExistentClass123", "");
    expect(completions).toEqual([]);
  });

  it("returns empty array with any current value when class is invalid", () => {
    const completions = completeMethodNames(sdk, "NonExistentClass123", "getSome");
    expect(completions).toEqual([]);
  });

  it("returns method names for valid SDK and class", () => {
    expect(withMethods).not.toBeNull();
    const completions = completeMethodNames(sdk, className, "");
    expect(Array.isArray(completions)).toBe(true);
    expect(completions.length).toBeGreaterThan(0);
  });

  it("handles various string inputs consistently for invalid class", () => {
    const inputs = ["method", "get", "create", "update"];
    for (const input of inputs) {
      expect(completeMethodNames(sdk, "NonExistentClass123", input)).toEqual([]);
    }
  });

  it("maintains consistent behavior with special characters for invalid class", () => {
    const inputs = ["_method", "method123", "method_name", "method-name"];
    for (const input of inputs) {
      expect(completeMethodNames(sdk, "NonExistentClass123", input)).toEqual([]);
    }
  });

  it("handles long input strings", () => {
    const completions = completeMethodNames(sdk, "NonExistentClass123", "method".repeat(100));
    expect(completions).toEqual([]);
  });

  it("handles unicode characters in input", () => {
    const completions = completeMethodNames(sdk, "NonExistentClass123", "méthod");
    expect(completions).toEqual([]);
  });

  it("filters method names by prefix for valid class", () => {
    expect(withMethods).not.toBeNull();
    const allMethods = completeMethodNames(sdk, className, "");
    const prefix = allMethods[0].slice(0, 3);
    const filtered = completeMethodNames(sdk, className, prefix);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((m) => m.toLowerCase().startsWith(prefix.toLowerCase()))).toBe(true);
  });
});
