// Entry point for `npm run db:seed`: inserts the v1 seed data if missing.
import { createDb } from "./db/client.js";
import { seedDb } from "./db/seed.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const { db, pool } = createDb(env.databaseUrl);
try {
  const { inserted } = await seedDb(db);
  console.log(
    inserted.length > 0
      ? `Seeded: ${inserted.join(", ")}.`
      : "Seed data already present; nothing to do.",
  );
} finally {
  await pool.end();
}
