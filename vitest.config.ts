import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      reporter: [["text", {}], ["cobertura", { file: "cobertura.xml" }]],
    },
    reporters: ["default", "junit"],
    outputFile: {
      junit: "./junit.xml",
    },
  },
});
