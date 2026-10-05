import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { environments, flagConfigs, flags, flagVariations } from "../src/db/schema.js";
import { newId } from "../src/ids.js";
import { call, createTestApp } from "./support/app.js";
import { useTestDb } from "./support/db.js";
import { createTenant, type Tenant } from "./support/fixtures.js";

const testDb = useTestDb();
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

let alice: Tenant;
let bob: Tenant;
let api: ReturnType<typeof createTestApp>;

beforeEach(async () => {
  alice = await createTenant(testDb.db, "alice");
  bob = await createTenant(testDb.db, "bob");
  api = createTestApp(testDb.db, alice.userId);
});

describe("GET /v1/me", () => {
  it("returns the current user and their orgs with roles", async () => {
    const { status, body } = await call(api, "GET", "/v1/me");
    expect(status).toBe(200);
    expect(body).toEqual({
      user: { id: alice.userId, email: "alice@example.com", name: "alice" },
      orgs: [{ id: alice.orgId, slug: "alice", name: "alice", role: "member" }],
    });
  });

  it("returns 401 if the configured user doesn't exist", async () => {
    const { status, body } = await call(createTestApp(testDb.db, newId("usr")), "GET", "/v1/me");
    expect(status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });
});

describe("apps", () => {
  it("lists the org's apps", async () => {
    const { status, body } = await call(api, "GET", `/v1/orgs/${alice.orgId}/apps`);
    expect(status).toBe(200);
    expect(body.apps).toEqual([
      {
        id: alice.appId,
        orgId: alice.orgId,
        slug: "web",
        name: "Web",
        createdAt: expect.stringMatching(ISO),
        updatedAt: expect.stringMatching(ISO),
      },
    ]);
  });

  it("creates an app with exactly two environments", async () => {
    const { status, body } = await call(api, "POST", `/v1/orgs/${alice.orgId}/apps`, {
      slug: "mobile",
      name: "Mobile",
    });
    expect(status).toBe(201);
    expect(body.app).toMatchObject({ orgId: alice.orgId, slug: "mobile", name: "Mobile" });
    expect(body.app.id).toMatch(/^app_/);
    expect(body.environments.map((e: { slug: string }) => e.slug)).toEqual([
      "development",
      "production",
    ]);

    const envs = await call(api, "GET", `/v1/apps/${body.app.id}/environments`);
    expect(envs.body.environments.map((e: { slug: string }) => e.slug)).toEqual([
      "development",
      "production",
    ]);
    expect(await testDb.db.$count(environments, eq(environments.applicationId, body.app.id))).toBe(2);

    const got = await call(api, "GET", `/v1/apps/${body.app.id}`);
    expect(got).toEqual({ status: 200, body: { app: body.app } });
  });

  it("rejects an invalid slug or missing name with 400", async () => {
    for (const payload of [
      { slug: "Bad Slug", name: "X" },
      { slug: "-leading", name: "X" },
      { slug: "a".repeat(65), name: "X" },
      { slug: "ok" },
      { slug: "ok", name: "   " },
    ]) {
      const { status, body } = await call(api, "POST", `/v1/orgs/${alice.orgId}/apps`, payload);
      expect(status, JSON.stringify(payload)).toBe(400);
      expect(body.error).toBe("validation_failed");
      expect(body.details.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects malformed JSON with 400", async () => {
    const { status, body } = await call(api, "POST", `/v1/orgs/${alice.orgId}/apps`, "{nope");
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });

  it("rejects a duplicate slug in the same org with 409, but allows it in another org", async () => {
    const dup = await call(api, "POST", `/v1/orgs/${alice.orgId}/apps`, { slug: "web", name: "Again" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("conflict");

    const bobApi = createTestApp(testDb.db, bob.userId);
    const other = await call(bobApi, "POST", `/v1/orgs/${bob.orgId}/apps`, { slug: "mobile", name: "M" });
    expect(other.status).toBe(201);
    const mine = await call(api, "POST", `/v1/orgs/${alice.orgId}/apps`, { slug: "mobile", name: "M" });
    expect(mine.status).toBe(201);
  });
});

describe("environments", () => {
  it("creates an environment with a config for every existing flag", async () => {
    // Two flags in alice's app, one archived, each with a config in "production".
    for (const [key, archived] of [["one", false], ["two", true]] as const) {
      const flagId = newId("flg");
      await testDb.db.insert(flags).values({
        id: flagId,
        applicationId: alice.appId,
        key,
        name: key,
        type: "string",
        createdBy: alice.userId,
        archivedAt: archived ? new Date() : null,
      });
      const ids = [newId("var"), newId("var"), newId("var")];
      await testDb.db.insert(flagVariations).values(
        ids.map((id, i) => ({ id, flagId, name: `v${i}`, value: `v${i}`, sortOrder: i })),
      );
      await testDb.db.insert(flagConfigs).values({
        flagId,
        environmentId: alice.envId,
        offVariationId: ids[2]!,
        defaultVariationId: ids[0]!,
        updatedBy: alice.userId,
      });
    }

    const { status, body } = await call(api, "POST", `/v1/apps/${alice.appId}/environments`, {
      slug: "staging",
      name: "Staging",
    });
    expect(status).toBe(201);
    expect(body.environment).toMatchObject({ applicationId: alice.appId, slug: "staging" });

    const configs = await testDb.db.query.flagConfigs.findMany({
      where: eq(flagConfigs.environmentId, body.environment.id),
      with: { offVariation: true, defaultVariation: true },
    });
    expect(configs).toHaveLength(2);
    for (const config of configs) {
      expect(config).toMatchObject({ enabled: false, version: 1, updatedBy: alice.userId });
      expect(config.defaultVariation.value).toBe("v0");
      expect(config.offVariation.value).toBe("v2");
    }
    // Invariant: one config per (flag, environment) for every environment.
    expect(await testDb.db.$count(flagConfigs)).toBe(2 * 2);

    const list = await call(api, "GET", `/v1/apps/${alice.appId}/environments`);
    expect(list.body.environments.map((e: { slug: string }) => e.slug)).toEqual([
      "production",
      "staging",
    ]);
  });

  it("rejects a duplicate environment slug with 409", async () => {
    const { status, body } = await call(api, "POST", `/v1/apps/${alice.appId}/environments`, {
      slug: "production",
      name: "Prod",
    });
    expect(status).toBe(409);
    expect(body.error).toBe("conflict");
  });

  it("validates the body", async () => {
    const { status, body } = await call(api, "POST", `/v1/apps/${alice.appId}/environments`, {
      slug: "UPPER",
      name: "x",
    });
    expect(status).toBe(400);
    expect(body.details.issues[0].path).toBe("slug");
  });
});

describe("cross-tenant access", () => {
  it("returns 404 for another tenant's (or a nonexistent) org, app, or environment list", async () => {
    const requests: [string, string, unknown?][] = [
      ["GET", `/v1/orgs/${bob.orgId}/apps`],
      ["POST", `/v1/orgs/${bob.orgId}/apps`, { slug: "x", name: "X" }],
      ["GET", `/v1/apps/${bob.appId}`],
      ["GET", `/v1/apps/${bob.appId}/environments`],
      ["POST", `/v1/apps/${bob.appId}/environments`, { slug: "x", name: "X" }],
      ["GET", `/v1/orgs/${newId("org")}/apps`],
      ["GET", `/v1/apps/${newId("app")}`],
    ];
    for (const [method, path, payload] of requests) {
      const { status, body } = await call(api, method, path, payload);
      expect(status, `${method} ${path}`).toBe(404);
      expect(body.error).toBe("not_found");
    }
    // Nothing was created in bob's tenant.
    expect(await testDb.db.$count(environments, eq(environments.applicationId, bob.appId))).toBe(1);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const { status, body } = await call(api, "GET", "/v1/nope");
    expect(status).toBe(404);
    expect(body.error).toBe("not_found");
  });
});
