import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  // timezone "Z": datetime columns hold UTC, so read and write them as UTC.
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    timezone: "Z",
  });
  const db = drizzle({ client: pool, schema, mode: "default" });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];

/** Resolves if the database answers a trivial query; rejects otherwise. */
export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

/** A transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Anything queries can run on: the pool-backed client or a transaction. */
export type Executor = Db | Tx;
