import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { environments, flagConfigs, flags } from "../src/db/schema.js";
import { newId } from "../src/ids.js";
import { call, createTestApp } from "./support/app.js";
import { useTestDb } from "./support/db.js";
import { createTenant, type Tenant } from "./support/fixtures.js";

const testDb = useTestDb();
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

let alice: Tenant;
let bob: Tenant;
let api: ReturnType<typeof createTestApp>;
/** alice's second environment ("staging"), alongside "production". */
let stagingId: string;

beforeEach(async () => {
  alice = await createTenant(testDb.db, "alice");
  bob = await createTenant(testDb.db, "bob");
  api = createTestApp(testDb.db, alice.userId);
  const res = await call(api, "POST", `/v1/apps/${alice.appId}/environments`, {
    slug: "staging",
    name: "Staging",
  });
  stagingId = res.body.environment.id;
});

async function createFlag(body: Record<string, unknown>, as = api, appId = alice.appId) {
  return call(as, "POST", `/v1/apps/${appId}/flags`, body);
}

const colorFlag = {
  key: "banner-color",
  name: "Banner color",
  type: "string",
  variations: [
    { name: "Blue", value: "blue" },
    { name: "Green", value: "green" },
    { name: "Red", value: "red" },
  ],
};

describe("POST /v1/apps/:appId/flags", () => {
  it("creates a boolean flag with On/Off variations and a config per environment", async () => {
    const { status, body } = await createFlag({
      key: "new-checkout",
      name: "New checkout",
      description: "Rolls out the new checkout",
      type: "boolean",
    });
    expect(status).toBe(201);
    const flag = body.flag;
    expect(flag).toMatchObject({
      applicationId: alice.appId,
      key: "new-checkout",
      name: "New checkout",
      description: "Rolls out the new checkout",
      type: "boolean",
      archivedAt: null,
      createdAt: expect.stringMatching(ISO),
      updatedAt: expect.stringMatching(ISO),
    });
    expect(flag.id).toMatch(/^flg_/);
    expect(flag.variations).toEqual([
      { id: expect.stringMatching(/^var_/), name: "On", value: true, sortOrder: 0 },
      { id: expect.stringMatching(/^var_/), name: "Off", value: false, sortOrder: 1 },
    ]);
    const [on, off] = flag.variations;
    expect(Object.keys(flag.configs).sort()).toEqual([alice.envId, stagingId].sort());
    for (const envId of [alice.envId, stagingId]) {
      expect(flag.configs[envId]).toEqual({
        environmentId: envId,
        enabled: false,
        offVariationId: off.id,
        defaultVariationId: on.id,
        version: 1,
        updatedAt: expect.stringMatching(ISO),
        updatedBy: alice.userId,
        targets: [],
      });
    }
  });

  it("creates a multi-variation flag: default → first, off → last", async () => {
    const { status, body } = await createFlag(colorFlag);
    expect(status).toBe(201);
    expect(body.flag.description).toBeNull();
    expect(body.flag.variations.map((v: { value: unknown }) => v.value)).toEqual([
      "blue",
      "green",
      "red",
    ]);
    const config = body.flag.configs[alice.envId];
    expect(config.defaultVariationId).toBe(body.flag.variations[0].id);
    expect(config.offVariationId).toBe(body.flag.variations[2].id);
  });

  it("accepts number and json variations", async () => {
    const num = await createFlag({
      key: "limit",
      name: "Limit",
      type: "number",
      variations: [{ name: "Low", value: 10 }, { name: "High", value: 1.5 }],
    });
    expect(num.status).toBe(201);
    const json = await createFlag({
      key: "layout",
      name: "Layout",
      type: "json",
      variations: [
        { name: "A", value: { columns: 2, tags: ["x"] } },
        { name: "None", value: null },
      ],
    });
    expect(json.status).toBe(201);
    expect(json.body.flag.variations.map((v: { value: unknown }) => v.value)).toEqual([
      { columns: 2, tags: ["x"] },
      null,
    ]);
  });

  it("rejects variation values that don't match the type with 400", async () => {
    const cases: [string, unknown[]][] = [
      ["string", ["a", 1]],
      ["number", [1, "2"]],
      ["number", [1, true]],
    ];
    for (const [type, values] of cases) {
      const { status, body } = await createFlag({
        key: "bad",
        name: "Bad",
        type,
        variations: values.map((value, i) => ({ name: `v${i}`, value })),
      });
      expect(status, `${type} ${JSON.stringify(values)}`).toBe(400);
      expect(body.error).toBe("validation_failed");
      expect(body.details.issues[0].path).toBe("variations.1.value");
    }
  });

  it("requires at least two variations for non-boolean flags, and none for booleans", async () => {
    const tooFew = await createFlag({ ...colorFlag, variations: [{ name: "Only", value: "x" }] });
    expect(tooFew.status).toBe(400);
    const missing = await createFlag({ key: "s", name: "S", type: "string" });
    expect(missing.status).toBe(400);
    const boolWithVariations = await createFlag({
      key: "b",
      name: "B",
      type: "boolean",
      variations: [{ name: "Y", value: true }, { name: "N", value: false }],
    });
    expect(boolWithVariations.status).toBe(400);
  });

  it("validates the key and type", async () => {
    for (const body of [
      { key: "Bad Key", name: "X", type: "boolean" },
      { key: "ok", name: "X", type: "date" },
      { key: "ok", type: "boolean" },
    ]) {
      const res = await createFlag(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("rejects a duplicate key in the same app with 409, but allows it in another app", async () => {
    expect((await createFlag(colorFlag)).status).toBe(201);
    const dup = await createFlag({ ...colorFlag, name: "Again" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("conflict");

    const bobApi = createTestApp(testDb.db, bob.userId);
    expect((await createFlag(colorFlag, bobApi, bob.appId)).status).toBe(201);
  });
});

describe("listing, reading, editing, and archiving", () => {
  it("lists non-archived flags by key, with variations and configs but no targets", async () => {
    const zeta = (await createFlag({ key: "zeta", name: "Z", type: "boolean" })).body.flag;
    await createFlag({ key: "alpha", name: "A", type: "boolean" });
    await createFlag({ key: "mid", name: "M", type: "boolean" });
    await call(api, "POST", `/v1/flags/${zeta.id}/archive`);

    const active = await call(api, "GET", `/v1/apps/${alice.appId}/flags`);
    expect(active.status).toBe(200);
    expect(active.body.flags.map((f: { key: string }) => f.key)).toEqual(["alpha", "mid"]);
    const first = active.body.flags[0];
    expect(first.variations).toHaveLength(2);
    expect(Object.keys(first.configs)).toHaveLength(2);
    expect(first.configs[alice.envId]).not.toHaveProperty("targets");

    const all = await call(api, "GET", `/v1/apps/${alice.appId}/flags?archived=true`);
    expect(all.body.flags.map((f: { key: string }) => f.key)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("gets a flag's detail", async () => {
    const created = (await createFlag(colorFlag)).body.flag;
    const { status, body } = await call(api, "GET", `/v1/flags/${created.id}`);
    expect(status).toBe(200);
    expect(body).toEqual({ flag: created });
  });

  it("patches name and description", async () => {
    const created = (await createFlag(colorFlag)).body.flag;
    const res = await call(api, "PATCH", `/v1/flags/${created.id}`, {
      name: "Renamed",
      description: "Now with words",
    });
    expect(res.status).toBe(200);
    expect(res.body.flag).toMatchObject({ name: "Renamed", description: "Now with words", key: "banner-color" });

    const cleared = await call(api, "PATCH", `/v1/flags/${created.id}`, { description: null });
    expect(cleared.body.flag).toMatchObject({ name: "Renamed", description: null });

    const bad = await call(api, "PATCH", `/v1/flags/${created.id}`, { name: "" });
    expect(bad.status).toBe(400);
  });

  it("archives and unarchives idempotently", async () => {
    const created = (await createFlag(colorFlag)).body.flag;
    const archived = await call(api, "POST", `/v1/flags/${created.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.flag.archivedAt).toMatch(ISO);
    const again = await call(api, "POST", `/v1/flags/${created.id}/archive`);
    expect(again.body.flag.archivedAt).toBe(archived.body.flag.archivedAt);

    const restored = await call(api, "POST", `/v1/flags/${created.id}/unarchive`);
    expect(restored.body.flag.archivedAt).toBeNull();
    expect((await call(api, "POST", `/v1/flags/${created.id}/unarchive`)).body.flag.archivedAt).toBeNull();
  });
});

describe("configs and targets", () => {
  let flag: { id: string; variations: { id: string }[] };
  const configPath = () => `/v1/flags/${flag.id}/environments/${alice.envId}`;

  beforeEach(async () => {
    flag = (await createFlag(colorFlag)).body.flag;
  });

  it("updates a config and increments its version", async () => {
    const res = await call(api, "PATCH", configPath(), {
      version: 1,
      enabled: true,
      defaultVariationId: flag.variations[1]!.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({
      environmentId: alice.envId,
      enabled: true,
      defaultVariationId: flag.variations[1]!.id,
      offVariationId: flag.variations[2]!.id,
      version: 2,
      updatedBy: alice.userId,
      targets: [],
    });
    // Other environments are untouched.
    const detail = await call(api, "GET", `/v1/flags/${flag.id}`);
    expect(detail.body.flag.configs[stagingId]).toMatchObject({ enabled: false, version: 1 });
  });

  it("rejects a stale version with 409 version_conflict and the current version", async () => {
    expect((await call(api, "PATCH", configPath(), { version: 1, enabled: true })).status).toBe(200);
    const stale = await call(api, "PATCH", configPath(), { version: 1, enabled: false });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "version_conflict", details: { currentVersion: 2 } });

    // The stale write changed nothing.
    const [config] = await testDb.db
      .select()
      .from(flagConfigs)
      .where(eq(flagConfigs.environmentId, alice.envId));
    expect(config).toMatchObject({ enabled: true, version: 2 });
  });

  it("rejects variations from another flag with 400", async () => {
    const other = (await createFlag({ key: "other", name: "O", type: "boolean" })).body.flag;
    const res = await call(api, "PATCH", configPath(), {
      version: 1,
      offVariationId: other.variations[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.details.issues[0].path).toBe("offVariationId");

    const target = await call(api, "PUT", `${configPath()}/targets/alice`, {
      version: 1,
      variationId: other.variations[0].id,
    });
    expect(target.status).toBe(400);
    expect(target.body.details.issues[0].path).toBe("variationId");
  });

  it("requires a version", async () => {
    const res = await call(api, "PATCH", configPath(), { enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.details.issues[0].path).toBe("version");
  });

  it("adds, replaces, and deletes targets for never-seen subjects, bumping the version each time", async () => {
    const key = "user@example.com/ü 1";
    const path = `${configPath()}/targets/${encodeURIComponent(key)}`;

    const added = await call(api, "PUT", path, { version: 1, variationId: flag.variations[1]!.id });
    expect(added.status).toBe(200);
    expect(added.body.config.version).toBe(2);
    expect(added.body.config.targets).toEqual([
      { subjectKey: key, variationId: flag.variations[1]!.id, createdAt: expect.stringMatching(ISO) },
    ]);

    const replaced = await call(api, "PUT", path, { version: 2, variationId: flag.variations[2]!.id });
    expect(replaced.body.config.version).toBe(3);
    expect(replaced.body.config.targets).toEqual([
      expect.objectContaining({ subjectKey: key, variationId: flag.variations[2]!.id }),
    ]);

    const stale = await call(api, "PUT", path, { version: 2, variationId: flag.variations[0]!.id });
    expect(stale.status).toBe(409);
    expect(stale.body.details).toEqual({ currentVersion: 3 });

    const staleDelete = await call(api, "DELETE", `${path}?version=1`);
    expect(staleDelete.status).toBe(409);

    const deleted = await call(api, "DELETE", `${path}?version=3`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.config).toMatchObject({ version: 4, targets: [] });

    // Deleting a target that doesn't exist is a 404 and doesn't bump the version.
    const missing = await call(api, "DELETE", `${path}?version=4`);
    expect(missing.status).toBe(404);
    const detail = await call(api, "GET", `/v1/flags/${flag.id}`);
    expect(detail.body.flag.configs[alice.envId].version).toBe(4);
  });

  it("returns targets on the flag detail, keyed by environment", async () => {
    await call(api, "PUT", `${configPath()}/targets/bob`, { version: 1, variationId: flag.variations[0]!.id });
    await call(api, "PUT", `${configPath()}/targets/Bob`, { version: 2, variationId: flag.variations[1]!.id });
    const detail = await call(api, "GET", `/v1/flags/${flag.id}`);
    expect(detail.body.flag.configs[alice.envId].targets.map((t: { subjectKey: string }) => t.subjectKey)).toEqual([
      "Bob",
      "bob",
    ]);
    expect(detail.body.flag.configs[stagingId].targets).toEqual([]);
  });

  it("validates subject key length and the delete version", async () => {
    const long = await call(api, "PUT", `${configPath()}/targets/${"k".repeat(256)}`, {
      version: 1,
      variationId: flag.variations[0]!.id,
    });
    expect(long.status).toBe(400);
    expect((await call(api, "DELETE", `${configPath()}/targets/x`)).status).toBe(400);
    expect((await call(api, "DELETE", `${configPath()}/targets/x?version=abc`)).status).toBe(400);
  });

  it("returns 404 for an environment from another app", async () => {
    const res = await call(api, "PATCH", `/v1/flags/${flag.id}/environments/${bob.envId}`, {
      version: 1,
      enabled: true,
    });
    expect(res.status).toBe(404);
  });

  it("creating a flag in an app with no environments, then an environment, keeps one config per pair", async () => {
    await testDb.db.delete(environments).where(eq(environments.applicationId, alice.appId));
    const created = (await createFlag({ key: "lonely", name: "L", type: "boolean" })).body.flag;
    expect(created.configs).toEqual({});
    const env = (await call(api, "POST", `/v1/apps/${alice.appId}/environments`, { slug: "dev", name: "Dev" })).body
      .environment;
    const detail = await call(api, "GET", `/v1/flags/${created.id}`);
    expect(Object.keys(detail.body.flag.configs)).toEqual([env.id]);
    expect(detail.body.flag.configs[env.id].offVariationId).toBe(created.variations[1].id);
  });
});

describe("cross-tenant access", () => {
  it("returns 404 on every flag route for another tenant's resources", async () => {
    const bobApi = createTestApp(testDb.db, bob.userId);
    const bobFlag = (await createFlag(colorFlag, bobApi, bob.appId)).body.flag;
    const varId = bobFlag.variations[0].id;
    const cfg = `/v1/flags/${bobFlag.id}/environments/${bob.envId}`;

    const requests: [string, string, unknown?][] = [
      ["GET", `/v1/apps/${bob.appId}/flags`],
      ["POST", `/v1/apps/${bob.appId}/flags`, { key: "x", name: "X", type: "boolean" }],
      ["GET", `/v1/flags/${bobFlag.id}`],
      ["PATCH", `/v1/flags/${bobFlag.id}`, { name: "Hacked" }],
      ["POST", `/v1/flags/${bobFlag.id}/archive`],
      ["POST", `/v1/flags/${bobFlag.id}/unarchive`],
      ["PATCH", cfg, { version: 1, enabled: true }],
      ["PUT", `${cfg}/targets/alice`, { version: 1, variationId: varId }],
      ["DELETE", `${cfg}/targets/alice?version=1`],
      ["GET", `/v1/flags/${newId("flg")}`],
    ];
    for (const [method, path, payload] of requests) {
      const { status, body } = await call(api, method, path, payload);
      expect(status, `${method} ${path}`).toBe(404);
      expect(body.error).toBe("not_found");
    }

    // Bob's flag is unchanged.
    const [row] = await testDb.db.select().from(flags).where(eq(flags.id, bobFlag.id));
    expect(row).toMatchObject({ name: "Banner color", archivedAt: null });
    const [config] = await testDb.db.select().from(flagConfigs).where(eq(flagConfigs.flagId, bobFlag.id));
    expect(config).toMatchObject({ enabled: false, version: 1 });
  });
});
