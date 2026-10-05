import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { currentUser, type ManagementEnv } from "../src/auth/current-user.js";
import { loadApplication, loadEnvironment, loadOrg } from "../src/auth/membership.js";
import type { Db } from "../src/db/client.js";
import { newId } from "../src/ids.js";
import { useTestDb } from "./support/db.js";
import { createTenant } from "./support/fixtures.js";

const testDb = useTestDb();

/** A minimal management app, wired the way real `/v1` routes will be. */
function managementApp(db: Db, currentUserId: string) {
  const app = new Hono<ManagementEnv>();
  app.use("*", currentUser({ db, currentUserId }));
  app.get("/me", (c) => c.json({ id: c.get("currentUser").id }));
  app.get("/orgs/:id", async (c) =>
    c.json(await loadOrg(db, c.get("currentUser").id, c.req.param("id"))),
  );
  app.get("/apps/:id", async (c) =>
    c.json(await loadApplication(db, c.get("currentUser").id, c.req.param("id"))),
  );
  app.get("/environments/:id", async (c) =>
    c.json(await loadEnvironment(db, c.get("currentUser").id, c.req.param("id"))),
  );
  return app;
}

describe("currentUser middleware", () => {
  it("puts the configured user on the context", async () => {
    const alice = await createTenant(testDb.db, "alice");
    const res = await managementApp(testDb.db, alice.userId).request("/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: alice.userId });
  });

  it("returns 401 if the configured user doesn't exist", async () => {
    const res = await managementApp(testDb.db, newId("usr")).request("/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });
});

describe("membership guard", () => {
  let alice: Awaited<ReturnType<typeof createTenant>>;
  let bob: Awaited<ReturnType<typeof createTenant>>;

  beforeEach(async () => {
    alice = await createTenant(testDb.db, "alice");
    bob = await createTenant(testDb.db, "bob");
  });

  const cases = [
    { path: "orgs", key: "orgId", fresh: () => newId("org") },
    { path: "apps", key: "appId", fresh: () => newId("app") },
    { path: "environments", key: "envId", fresh: () => newId("env") },
  ] as const;

  for (const { path, key, fresh } of cases) {
    describe(`/${path}/:id`, () => {
      it("returns the resource to a member", async () => {
        const res = await managementApp(testDb.db, alice.userId).request(
          `/${path}/${alice[key]}`,
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ id: alice[key] });
      });

      it("returns 404 to a non-member", async () => {
        const res = await managementApp(testDb.db, alice.userId).request(
          `/${path}/${bob[key]}`,
        );
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ error: "not_found" });
      });

      it("returns 404 for a nonexistent ID", async () => {
        const res = await managementApp(testDb.db, alice.userId).request(
          `/${path}/${fresh()}`,
        );
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ error: "not_found" });
      });
    });
  }
});
