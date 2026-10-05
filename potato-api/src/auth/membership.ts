import { and, eq, getTableColumns } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  applications,
  environments,
  orgMembers,
  organizations,
  type Application,
  type Environment,
  type Organization,
} from "../db/schema.js";
import { apiError } from "../http/errors.js";

// Membership guards. Each loads a resource by ID only if `userId` is a member
// of the org that owns it, and otherwise throws a 404 (never 403), so another
// tenant's IDs are indistinguishable from IDs that don't exist.

/** Loads an org the user belongs to, or throws `404`. */
export async function loadOrg(db: Db, userId: string, orgId: string): Promise<Organization> {
  const [org] = await db
    .select(getTableColumns(organizations))
    .from(organizations)
    .innerJoin(
      orgMembers,
      and(eq(orgMembers.orgId, organizations.id), eq(orgMembers.userId, userId)),
    )
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw notFound("Organization");
  return org;
}

/** Loads an application in an org the user belongs to, or throws `404`. */
export async function loadApplication(
  db: Db,
  userId: string,
  applicationId: string,
): Promise<Application> {
  const [app] = await db
    .select(getTableColumns(applications))
    .from(applications)
    .innerJoin(
      orgMembers,
      and(eq(orgMembers.orgId, applications.orgId), eq(orgMembers.userId, userId)),
    )
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) throw notFound("Application");
  return app;
}

/** Loads an environment in an org the user belongs to, or throws `404`. */
export async function loadEnvironment(
  db: Db,
  userId: string,
  environmentId: string,
): Promise<Environment> {
  const [env] = await db
    .select(getTableColumns(environments))
    .from(environments)
    .innerJoin(applications, eq(applications.id, environments.applicationId))
    .innerJoin(
      orgMembers,
      and(eq(orgMembers.orgId, applications.orgId), eq(orgMembers.userId, userId)),
    )
    .where(eq(environments.id, environmentId))
    .limit(1);
  if (!env) throw notFound("Environment");
  return env;
}

function notFound(resource: string) {
  return apiError(404, "not_found", `${resource} not found`);
}
