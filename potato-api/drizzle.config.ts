import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file; rely on the real environment.
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
});
