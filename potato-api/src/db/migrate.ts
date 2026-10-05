import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/mysql2/migrator";
import type { Db } from "./client.js";

/** The generated SQL migrations, relative to this module (src/ or dist/). */
export const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/** Applies every pending migration in ./drizzle to `db`. */
export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
