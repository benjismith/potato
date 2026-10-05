import { describe, expect, it } from "vitest";
import { SEED_IDS } from "../src/db/seed.js";
import { createTestApp } from "./support/app.js";
import { useTestDb } from "./support/db.js";

const testDb = useTestDb();

describe("GET /health", () => {
  it("reports ok when the database is reachable", async () => {
    const app = createTestApp(testDb.db, SEED_IDS.user);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("reports a database error without failing the request", async () => {
    const app = createTestApp(testDb.db, SEED_IDS.user, {
      pingDb: async () => {
        throw new Error("connection refused");
      },
    });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      database: "error",
      error: "connection refused",
    });
  });
});
