import mysql from "mysql2/promise";
import { createDb } from "../../src/db/client.js";
import { migrateDb } from "../../src/db/migrate.js";
import { requireTestDatabaseUrl } from "./test-env.js";

/**
 * Runs once before the whole suite: creates the test database if it's missing,
 * then applies every migration in ./drizzle to it.
 */
export default async function setup() {
  const url = requireTestDatabaseUrl();
  const database = new URL(url).pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`TEST_DATABASE_URL has an unexpected database name: "${database}"`);
  }

  const serverUrl = new URL(url);
  serverUrl.pathname = "/";
  const conn = await mysql.createConnection({ uri: serverUrl.toString() });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  } finally {
    await conn.end();
  }

  const { db, pool } = createDb(url);
  try {
    await migrateDb(db);
  } finally {
    await pool.end();
  }
}
