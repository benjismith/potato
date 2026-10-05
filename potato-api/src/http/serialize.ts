// Row → API resource shapes (API.md). Dates serialize to ISO-8601 UTC strings
// via Date#toJSON when the response is JSON-encoded.
import type { Application, Environment, Organization, OrgMember, User } from "../db/schema.js";

export const toUser = (u: User) => ({ id: u.id, email: u.email, name: u.name });

export const toOrg = (o: Organization, role: OrgMember["role"]) => ({
  id: o.id,
  slug: o.slug,
  name: o.name,
  role,
});

export const toApp = (a: Application) => ({
  id: a.id,
  orgId: a.orgId,
  slug: a.slug,
  name: a.name,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

export const toEnvironment = (e: Environment) => ({
  id: e.id,
  applicationId: e.applicationId,
  slug: e.slug,
  name: e.name,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});
