import { describe, expect, it } from "vitest";
import { classifyOpenFgaAuthError, isOpenFga401 } from "../../src/openfga-auth-error.js";

describe("openfga auth error classifier", () => {
  it("detects 401 status codes", () => {
    expect(isOpenFga401({ statusCode: 401 })).toBe(true);
    expect(isOpenFga401(new Error("HTTP 401 Unauthorized"))).toBe(true);
    expect(isOpenFga401(new Error("forbidden"))).toBe(false);
  });

  it("re_elicits for scoped credentials", () => {
    expect(classifyOpenFgaAuthError({ statusCode: 401 }, "scoped")).toBe("re_elicit");
  });

  it("refreshes config for fixed credentials", () => {
    expect(classifyOpenFgaAuthError({ statusCode: 401 }, "config")).toBe("refresh_config");
  });

  it("returns other for non-401 errors", () => {
    expect(classifyOpenFgaAuthError({ statusCode: 500 }, "scoped")).toBe("other");
  });
});
