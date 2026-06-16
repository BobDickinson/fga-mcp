import { describe, expect, it } from "vitest";
import { modelToDsl, parseDsl, parseEntityString, verifyDsl } from "../../src/dsl.js";

const VALID_DSL = `model
  schema 1.1
type user
type document
  relations
    define reader: [user]`;

describe("parseDsl", () => {
  it("parses valid DSL", () => {
    const result = parseDsl(VALID_DSL);
    expect(result.schema_version).toBe("1.1");
    expect(result.type_definitions?.length).toBeGreaterThan(0);
  });

  it("throws on invalid DSL", () => {
    expect(() => parseDsl("invalid dsl")).toThrow();
  });
});

describe("verifyDsl", () => {
  it("accepts valid DSL", () => {
    expect(() => verifyDsl(VALID_DSL)).not.toThrow();
  });

  it("rejects invalid DSL", () => {
    expect(() => verifyDsl("invalid dsl")).toThrow();
  });
});

describe("modelToDsl", () => {
  it("round-trips through parse and serialize", () => {
    const parsed = parseDsl(VALID_DSL);
    const dsl = modelToDsl({
      schema_version: parsed.schema_version,
      type_definitions: parsed.type_definitions,
      conditions: parsed.conditions,
    });
    expect(dsl).toContain("type user");
    expect(dsl).toContain("type document");
  });
});

describe("parseEntityString", () => {
  it("parses type:id format", () => {
    expect(parseEntityString("user:alice")).toEqual({ type: "user", id: "alice" });
  });

  it("handles type without id", () => {
    expect(parseEntityString("user")).toEqual({ type: "user", id: "" });
  });
});
