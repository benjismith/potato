import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ManagementEnv } from "../../auth/current-user.js";
import { loadApplication, loadOrg } from "../../auth/membership.js";
import type { Db } from "../../db/client.js";
import { applications, environments, orgMembers, organizations } from "../../db/schema.js";
import { createEnvironment, DEFAULT_ENVIRONMENTS } from "../../domain/environments.js";
import { apiError, isDuplicateKeyError } from "../../http/errors.js";
import { toApp, toEnvironment, toOrg, toUser } from "../../http/serialize.js";
import { nameSchema, slugSchema, validate } from "../../http/validation.js";
import { newId } from "../../ids.js";

const createBody = z.object({ slug: slugSchema, name: nameSchema });

/** `/v1/me`, `/v1/orgs/:orgId/apps`, and `/v1/apps/:appId[/environments]`. */
export function tenancyRoutes(deps: { db: Db }) {
  const { db } = deps;

  return new Hono<ManagementEnv>()
    .get("/me", async (c) => {
      const user = c.get("currentUser");
      const rows = await db
        .select({ org: organizations, role: orgMembers.role })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
        .where(eq(orgMembers.userId, user.id))
        .orderBy(asc(organizations.name), asc(organizations.id));
      return c.json({ user: toUser(user), orgs: rows.map((r) => toOrg(r.org, r.role)) });
    })

    .get("/orgs/:orgId/apps", async (c) => {
      const org = await loadOrg(db, c.get("currentUser").id, c.req.param("orgId"));
      const apps = await db
        .select()
        .from(applications)
        .where(eq(applications.orgId, org.id))
        .orderBy(asc(applications.name), asc(applications.id));
      return c.json({ apps: apps.map(toApp) });
    })

    .post("/orgs/:orgId/apps", validate("json", createBody), async (c) => {
      const user = c.get("currentUser");
      const org = await loadOrg(db, user.id, c.req.param("orgId"));
      const body = c.req.valid("json");
      try {
        const result = await db.transaction(async (tx) => {
          const id = newId("app");
          await tx.insert(applications).values({ id, orgId: org.id, ...body });
          const envs = [];
          for (const env of DEFAULT_ENVIRONMENTS) {
            envs.push(
              await createEnvironment(tx, { applicationId: id, userId: user.id, ...env }),
            );
          }
          const [app] = await tx.select().from(applications).where(eq(applications.id, id));
          return { app: app!, envs };
        });
        return c.json(
          { app: toApp(result.app), environments: result.envs.map(toEnvironment) },
          201,
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw apiError(409, "conflict", `An app with slug "${body.slug}" already exists in this org`);
        }
        throw err;
      }
    })

    .get("/apps/:appId", async (c) => {
      const app = await loadApplication(db, c.get("currentUser").id, c.req.param("appId"));
      return c.json({ app: toApp(app) });
    })

    .get("/apps/:appId/environments", async (c) => {
      const app = await loadApplication(db, c.get("currentUser").id, c.req.param("appId"));
      const envs = await db
        .select()
        .from(environments)
        .where(eq(environments.applicationId, app.id))
        .orderBy(asc(environments.createdAt), asc(environments.id));
      return c.json({ environments: envs.map(toEnvironment) });
    })

    .post("/apps/:appId/environments", validate("json", createBody), async (c) => {
      const user = c.get("currentUser");
      const app = await loadApplication(db, user.id, c.req.param("appId"));
      const body = c.req.valid("json");
      try {
        const env = await db.transaction((tx) =>
          createEnvironment(tx, { applicationId: app.id, userId: user.id, ...body }),
        );
        return c.json({ environment: toEnvironment(env) }, 201);
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw apiError(
            409,
            "conflict",
            `An environment with slug "${body.slug}" already exists in this app`,
          );
        }
        throw err;
      }
    });
}

