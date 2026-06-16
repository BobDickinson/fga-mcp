import { beforeAll, describe, expect, it } from "vitest";
import { completeChunkIds } from "../../../src/completions/index.js";
import { getDocumentationIndex } from "../../../src/documentation/index.js";

beforeAll(() => {
  getDocumentationIndex().initialize();
});

describe("completeChunkIds", () => {
  const index = getDocumentationIndex();
  const sdk = index.getSdkList()[0];

  it("returns empty array when search query is empty", () => {
    const completions = completeChunkIds(sdk, "");
    expect(completions).toEqual([]);
  });

  it("returns empty array with current value filtering when no search matches", () => {
    const completions = completeChunkIds(sdk, "test");
    expect(completions).toEqual([]);
  });

  it("handles various input values gracefully", () => {
    expect(completeChunkIds(sdk, "")).toEqual([]);
    expect(completeChunkIds(sdk, "a")).toEqual([]);
    expect(completeChunkIds(sdk, "a".repeat(100))).toEqual([]);
  });

  it("returns consistent results across multiple calls", () => {
    const first = completeChunkIds(sdk, "test");
    const second = completeChunkIds(sdk, "test");
    expect(first).toEqual(second);
  });

  it("handles special characters in input", () => {
    const completions = completeChunkIds(sdk, "test-chunk_123");
    expect(completions).toEqual([]);
  });

  it("returns empty array for invalid SDK", () => {
    const completions = completeChunkIds("definitely_invalid_sdk_name_123", "");
    expect(completions).toEqual([]);
  });
});
