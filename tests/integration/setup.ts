import { afterAll, beforeAll } from "vitest";
import { cleanupIntegrationTests, initIntegrationTests } from "./helpers.js";

beforeAll(async () => {
  await initIntegrationTests();
}, 120_000);

afterAll(async () => {
  await cleanupIntegrationTests();
});
