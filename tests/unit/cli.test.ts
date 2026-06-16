import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli.js";

describe("parseCliArgs", () => {
  it("parses --config path", () => {
    expect(parseCliArgs(["--config", "/path/to/fga.json"])).toEqual({
      configPath: "/path/to/fga.json",
    });
  });

  it("parses transport and port", () => {
    expect(parseCliArgs(["--transport", "http", "--port", "3000"])).toEqual({
      transport: "http",
      port: 3000,
    });
  });

  it("parses boolean flags", () => {
    expect(parseCliArgs(["--sse", "--no-stateless", "--debug", "--no-debug"])).toEqual({
      sse: true,
      stateless: false,
      debug: false,
    });
  });

  it("ignores unknown args", () => {
    expect(parseCliArgs(["--unknown", "value", "--host", "0.0.0.0"])).toEqual({
      host: "0.0.0.0",
    });
  });
});
