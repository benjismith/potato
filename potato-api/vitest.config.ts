import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

export default defineConfig({
  test: {
    // Creates and migrates the integration-test database once per run.
    globalSetup: ["./test/support/global-setup.ts"],
    // Integration tests share one database (TEST_DATABASE_URL) and truncate it
    // between tests, so test files must not run concurrently.
    fileParallelism: false,
  },
});
