import { describe, expect, it } from "vitest";
import {
  applications,
  environments,
  orgMembers,
  organizations,
  users,
} from "../src/db/schema.js";
import { SEED_IDS, seedDb } from "../src/db/seed.js";
import { isId } from "../src/ids.js";
import { useTestDb } from "./support/db.js";

const testDb = useTestDb();

describe("seedDb", () => {
  it("uses well-formed IDs", () => {
    expect(isId(SEED_IDS.user, "usr")).toBe(true);
    expect(isId(SEED_IDS.org, "org")).toBe(true);
    expect(isId(SEED_IDS.app, "app")).toBe(true);
    expect(isId(SEED_IDS.development, "env")).toBe(true);
    expect(isId(SEED_IDS.production, "env")).toBe(true);
  });

  it("creates a user who owns an org with one app and two environments", async () => {
    const { db } = testDb;
    const first = await seedDb(db);
    expect(first.inserted).toEqual([
      "user",
      "org",
      "org member",
      "app",
      "development environment",
      "production environment",
    ]);

    const org = await db.query.organizations.findFirst({
      with: {
        members: true,
        applications: { with: { environments: true } },
      },
    });
    expect(org?.members).toEqual([
      expect.objectContaining({ userId: SEED_IDS.user, role: "owner" }),
    ]);
    expect(org?.applications).toHaveLength(1);
    expect(org?.applications[0]?.environments.map((e) => e.slug).sort()).toEqual([
      "development",
      "production",
    ]);
  });

  it("is idempotent", async () => {
    const { db } = testDb;
    await seedDb(db);
    const before = await db.query.users.findFirst();
    const second = await seedDb(db);

    expect(second.inserted).toEqual([]);
    expect(await db.$count(users)).toBe(1);
    expect(await db.$count(organizations)).toBe(1);
    expect(await db.$count(orgMembers)).toBe(1);
    expect(await db.$count(applications)).toBe(1);
    expect(await db.$count(environments)).toBe(2);
    expect(await db.query.users.findFirst()).toEqual(before);
  });
});
