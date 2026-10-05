import { and, eq } from "drizzle-orm";
import type { Db } from "./client.js";
import {
  applications,
  environments,
  orgMembers,
  organizations,
  users,
} from "./schema.js";

/**
 * Fixed IDs for the seed rows, so seeding is idempotent and the current-user
 * stub has a stable default (`POTATO_CURRENT_USER_ID`). Each is a valid
 * prefixed ULID with a zero timestamp.
 */
export const SEED_IDS = {
  user: "usr_0000000000000000000000SEED",
  org: "org_0000000000000000000000SEED",
  app: "app_0000000000000000000000SEED",
  development: "env_0000000000000000000SEEDDEV",
  production: "env_0000000000000000000SEEDPRD",
} as const;

export interface SeedResult {
  /** Names of the rows this run inserted (empty if everything existed). */
  inserted: string[];
}

/**
 * Creates the v1 seed data if it's missing: one user, one org with that user
 * as `owner`, and one app with `development` and `production` environments.
 * Existing rows are left untouched, so running it repeatedly is safe.
 */
export async function seedDb(db: Db): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const inserted: string[] = [];

    const user = await tx.query.users.findFirst({ where: eq(users.id, SEED_IDS.user) });
    if (!user) {
      await tx.insert(users).values({
        id: SEED_IDS.user,
        email: "you@example.com",
        name: "Potato User",
      });
      inserted.push("user");
    }

    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.id, SEED_IDS.org),
    });
    if (!org) {
      await tx
        .insert(organizations)
        .values({ id: SEED_IDS.org, slug: "default", name: "Default Org" });
      inserted.push("org");
    }

    const member = await tx.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, SEED_IDS.org), eq(orgMembers.userId, SEED_IDS.user)),
    });
    if (!member) {
      await tx
        .insert(orgMembers)
        .values({ orgId: SEED_IDS.org, userId: SEED_IDS.user, role: "owner" });
      inserted.push("org member");
    }

    const app = await tx.query.applications.findFirst({
      where: eq(applications.id, SEED_IDS.app),
    });
    if (!app) {
      await tx
        .insert(applications)
        .values({ id: SEED_IDS.app, orgId: SEED_IDS.org, slug: "demo", name: "Demo App" });
      inserted.push("app");
    }

    for (const [slug, name, id] of [
      ["development", "Development", SEED_IDS.development],
      ["production", "Production", SEED_IDS.production],
    ] as const) {
      const env = await tx.query.environments.findFirst({ where: eq(environments.id, id) });
      if (!env) {
        await tx.insert(environments).values({ id, applicationId: SEED_IDS.app, slug, name });
        inserted.push(`${slug} environment`);
      }
    }

    return { inserted };
  });
}
