import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { createDb, type Db } from "../../src/db/client.js";
import { requireTestDatabaseUrl } from "./test-env.js";

/**
 * Connects to the (already migrated) test database for one test file, and
 * empties every table before each test. Call it at the top level of a test
 * file or inside a `describe` block:
 *
 *   const testDb = useTestDb();
 *   it("...", async () => { await testDb.db.insert(...) });
 */
export function useTestDb(): { readonly db: Db } {
  const { db, pool } = createDb(requireTestDatabaseUrl());

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  return { db };
}

/** Empties every table except drizzle-kit's migration journal. */
export async function truncateAll(db: Db): Promise<void> {
  const [rows] = (await db.execute(sql`
    select table_name as name from information_schema.tables
    where table_schema = database()
      and table_type = 'BASE TABLE'
      and table_name <> '__drizzle_migrations'
  `)) as unknown as [{ name: string }[]];

  // FOREIGN_KEY_CHECKS is per-session, so pin one connection for the batch.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set foreign_key_checks = 0`);
    try {
      for (const { name } of rows) {
        await tx.execute(sql`truncate table ${sql.identifier(name)}`);
      }
    } finally {
      await tx.execute(sql`set foreign_key_checks = 1`);
    }
  });
}
