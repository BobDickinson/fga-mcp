import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      reporter: [["cobertura", { file: "integration-cobertura.xml" }]],
    },
    reporters: ["default", "junit"],
    outputFile: {
      junit: "./integration-junit.xml",
    },
  },
});
