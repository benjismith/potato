import type { Db } from "../../src/db/client.js";
import {
  applications,
  environments,
  orgMembers,
  organizations,
  users,
} from "../../src/db/schema.js";
import { newId } from "../../src/ids.js";

export interface Tenant {
  userId: string;
  orgId: string;
  appId: string;
  envId: string;
}

/**
 * Creates a user who is the sole member of an org (slug = `name`) with one
 * app (`web`) and one environment (`production`). Inserted directly, so no
 * flag configs exist.
 */
export async function createTenant(db: Db, name: string): Promise<Tenant> {
  const user = { id: newId("usr"), email: `${name}@example.com`, name };
  const org = { id: newId("org"), slug: name, name };
  const app = { id: newId("app"), orgId: org.id, slug: "web", name: "Web" };
  const env = { id: newId("env"), applicationId: app.id, slug: "production", name: "Production" };
  await db.insert(users).values(user);
  await db.insert(organizations).values(org);
  await db.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: "member" });
  await db.insert(applications).values(app);
  await db.insert(environments).values(env);
  return { userId: user.id, orgId: org.id, appId: app.id, envId: env.id };
}
