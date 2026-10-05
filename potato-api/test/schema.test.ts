import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "../src/db/client.js";
import {
  applications,
  environments,
  flagConfigs,
  flagTargets,
  flags,
  flagVariations,
  orgMembers,
  organizations,
  users,
} from "../src/db/schema.js";
import { useTestDb } from "./support/db.js";

const testDb = useTestDb();

/** Inserts a user, an org they own, and an app with one environment. */
async function seedTenant(db: Db) {
  await db.insert(users).values({ id: "usr_1", email: "a@example.com", name: "A" });
  await db.insert(organizations).values({ id: "org_1", slug: "acme", name: "Acme" });
  await db.insert(orgMembers).values({ orgId: "org_1", userId: "usr_1", role: "owner" });
  await db
    .insert(applications)
    .values({ id: "app_1", orgId: "org_1", slug: "web", name: "Web" });
  await db.insert(environments).values({
    id: "env_1",
    applicationId: "app_1",
    slug: "production",
    name: "Production",
  });
}

/** Inserts a boolean flag with true/false variations and a config in env_1. */
async function seedBooleanFlag(db: Db, id: string, key: string) {
  await db.insert(flags).values({
    id,
    applicationId: "app_1",
    key,
    name: key,
    type: "boolean",
    createdBy: "usr_1",
  });
  await db.insert(flagVariations).values([
    { id: `${id}_t`, flagId: id, name: "On", value: true, sortOrder: 0 },
    { id: `${id}_f`, flagId: id, name: "Off", value: false, sortOrder: 1 },
  ]);
  await db.insert(flagConfigs).values({
    flagId: id,
    environmentId: "env_1",
    offVariationId: `${id}_f`,
    defaultVariationId: `${id}_t`,
    updatedBy: "usr_1",
  });
}

describe("v1 schema", () => {
  it("round-trips rows, defaults, and relational queries", async () => {
    const { db } = testDb;
    await seedTenant(db);
    await seedBooleanFlag(db, "flg_1", "new-checkout");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, "org_1"));
    expect(org).toMatchObject({ slug: "acme", name: "Acme" });
    expect(org?.createdAt).toBeInstanceOf(Date);
    // Server-side default is UTC "now"; allow generous clock skew.
    expect(Math.abs(org!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);

    const flag = await db.query.flags.findFirst({
      where: eq(flags.key, "new-checkout"),
      with: {
        variations: { orderBy: (v, { asc }) => [asc(v.sortOrder)] },
        configs: { with: { offVariation: true, defaultVariation: true } },
        application: { with: { org: true } },
      },
    });
    expect(flag?.variations.map((v) => v.value)).toEqual([true, false]);
    expect(flag?.configs).toHaveLength(1);
    expect(flag?.configs[0]).toMatchObject({ enabled: false, version: 1 });
    expect(flag?.configs[0]?.offVariation.value).toBe(false);
    expect(flag?.configs[0]?.defaultVariation.value).toBe(true);
    expect(flag?.application.org.slug).toBe("acme");
  });

  it("rejects a duplicate flag key within an app", async () => {
    const { db } = testDb;
    await seedTenant(db);
    await seedBooleanFlag(db, "flg_1", "new-checkout");

    await expect(
      db.insert(flags).values({
        id: "flg_2",
        applicationId: "app_1",
        key: "new-checkout",
        name: "Duplicate",
        type: "boolean",
        createdBy: "usr_1",
      }),
    ).rejects.toMatchObject({ cause: { code: "ER_DUP_ENTRY" } });
  });

  it("allows the same flag key in a different app", async () => {
    const { db } = testDb;
    await seedTenant(db);
    await seedBooleanFlag(db, "flg_1", "new-checkout");
    await db
      .insert(applications)
      .values({ id: "app_2", orgId: "org_1", slug: "mobile", name: "Mobile" });

    await db.insert(flags).values({
      id: "flg_2",
      applicationId: "app_2",
      key: "new-checkout",
      name: "Same key, other app",
      type: "boolean",
      createdBy: "usr_1",
    });
    expect(await db.$count(flags)).toBe(2);
  });

  it("treats subject keys as case-sensitive", async () => {
    const { db } = testDb;
    await seedTenant(db);
    await seedBooleanFlag(db, "flg_1", "new-checkout");

    await db.insert(flagTargets).values([
      { flagId: "flg_1", environmentId: "env_1", subjectKey: "User1", variationId: "flg_1_t" },
      { flagId: "flg_1", environmentId: "env_1", subjectKey: "user1", variationId: "flg_1_f" },
    ]);
    expect(await db.$count(flagTargets)).toBe(2);
  });

  it("cascades deletes from an org down through flags, configs, and targets", async () => {
    const { db } = testDb;
    await seedTenant(db);
    await seedBooleanFlag(db, "flg_1", "new-checkout");
    await db.insert(flagTargets).values({
      flagId: "flg_1",
      environmentId: "env_1",
      subjectKey: "alice",
      variationId: "flg_1_t",
    });

    await db.delete(organizations).where(eq(organizations.id, "org_1"));

    for (const table of [orgMembers, applications, environments, flags, flagVariations, flagConfigs, flagTargets]) {
      expect(await db.$count(table)).toBe(0);
    }
    // Users aren't owned by orgs, so they survive.
    expect(await db.$count(users)).toBe(1);
  });

  it("starts each test with empty tables", async () => {
    const { db } = testDb;
    expect(await db.$count(users)).toBe(0);
    expect(await db.$count(flags)).toBe(0);
  });
});
