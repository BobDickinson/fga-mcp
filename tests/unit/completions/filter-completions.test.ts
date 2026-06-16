import { describe, expect, it } from "vitest";
import { filterCompletions } from "../../../src/completions/index.js";

describe("filterCompletions", () => {
  it("returns all completions when value is empty", () => {
    expect(filterCompletions(["apple", "banana", "apricot", "cherry"], "")).toEqual([
      "apple",
      "banana",
      "apricot",
      "cherry",
    ]);
  });

  it("filters completions based on current value", () => {
    expect(filterCompletions(["apple", "banana", "apricot", "cherry"], "ap")).toEqual([
      "apple",
      "apricot",
    ]);
  });

  it("filters case-insensitively", () => {
    expect(filterCompletions(["apple", "banana", "apricot", "cherry"], "AP")).toEqual([
      "apple",
      "apricot",
    ]);
  });

  it("returns empty array when no matches", () => {
    expect(filterCompletions(["apple", "banana", "apricot", "cherry"], "xyz")).toEqual([]);
  });

  it("filters by prefix case-insensitively for SDK-style values", () => {
    expect(filterCompletions(["php", "go", "python"], "Py")).toEqual(["python"]);
  });
});
