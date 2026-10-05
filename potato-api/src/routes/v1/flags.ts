import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ManagementEnv } from "../../auth/current-user.js";
import { loadApplication, loadFlag } from "../../auth/membership.js";
import type { Db, Executor } from "../../db/client.js";
import {
  environments,
  flagConfigs,
  flags,
  flagTargets,
  flagTypes,
  flagVariations,
  type Flag,
} from "../../db/schema.js";
import {
  BOOLEAN_VARIATIONS,
  defaultConfigVariations,
  variationValueError,
} from "../../domain/flags.js";
import { apiError, isDuplicateKeyError, notFound } from "../../http/errors.js";
import { toFlag, toFlagConfigWithTargets, toFlagDetail } from "../../http/serialize.js";
import { invalid, nameSchema, slugSchema, validate } from "../../http/validation.js";
import { newId } from "../../ids.js";

const descriptionSchema = z.string().max(65_535).nullable();

const createFlagBody = z
  .object({
    key: slugSchema,
    name: nameSchema,
    description: descriptionSchema.optional(),
    type: z.enum(flagTypes),
    variations: z
      .array(z.object({ name: nameSchema, value: z.unknown() }))
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.type === "boolean") {
      if (body.variations !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["variations"],
          message: "Omit variations for boolean flags; On (true) and Off (false) are created automatically",
        });
      }
      return;
    }
    if (!body.variations || body.variations.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["variations"],
        message: `A ${body.type} flag needs at least two variations`,
      });
      return;
    }
    body.variations.forEach((v, i) => {
      const error = variationValueError(body.type, v.value);
      if (error) ctx.addIssue({ code: "custom", path: ["variations", i, "value"], message: error });
    });
  });

const updateFlagBody = z.object({ name: nameSchema.optional(), description: descriptionSchema.optional() });

const version = z.number().int().min(1);

const updateConfigBody = z.object({
  version,
  enabled: z.boolean().optional(),
  offVariationId: z.string().optional(),
  defaultVariationId: z.string().optional(),
});

const putTargetBody = z.object({ version, variationId: z.string() });

const deleteTargetQuery = z.object({ version: z.coerce.number().int().min(1) });

const listQuery = z.object({ archived: z.enum(["true", "false"]).optional() });

/** Flags, variations, per-environment configs, and targets (API.md, task 000006). */
export function flagRoutes(deps: { db: Db }) {
  const { db } = deps;

  return new Hono<ManagementEnv>()
    .get("/apps/:appId/flags", validate("query", listQuery), async (c) => {
      const app = await loadApplication(db, c.get("currentUser").id, c.req.param("appId"));
      const includeArchived = c.req.valid("query").archived === "true";
      const rows = await db.query.flags.findMany({
        where: and(
          eq(flags.applicationId, app.id),
          includeArchived ? undefined : isNull(flags.archivedAt),
        ),
        orderBy: [asc(flags.key)],
        with: { variations: true, configs: true },
      });
      return c.json({ flags: rows.map(toFlag) });
    })

    .post("/apps/:appId/flags", validate("json", createFlagBody), async (c) => {
      const user = c.get("currentUser");
      const app = await loadApplication(db, user.id, c.req.param("appId"));
      const body = c.req.valid("json");
      const variations = body.type === "boolean" ? BOOLEAN_VARIATIONS : body.variations!;
      try {
        const flagId = await db.transaction(async (tx) => {
          const flagId = newId("flg");
          await tx.insert(flags).values({
            id: flagId,
            applicationId: app.id,
            key: body.key,
            name: body.name,
            description: body.description ?? null,
            type: body.type,
            createdBy: user.id,
          });
          const variationRows = variations.map((v, i) => ({
            id: newId("var"),
            flagId,
            name: v.name,
            // Drizzle would write a JS null as SQL NULL; store JSON null instead.
            value: v.value === null ? sql`cast('null' as json)` : v.value,
            sortOrder: i,
          }));
          await tx.insert(flagVariations).values(variationRows);

          const envs = await tx
            .select({ id: environments.id })
            .from(environments)
            .where(eq(environments.applicationId, app.id));
          if (envs.length > 0) {
            const defaults = defaultConfigVariations(variationRows);
            await tx.insert(flagConfigs).values(
              envs.map((env) => ({
                flagId,
                environmentId: env.id,
                ...defaults,
                updatedBy: user.id,
              })),
            );
          }
          return flagId;
        });
        return c.json({ flag: await flagDetail(db, flagId) }, 201);
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw apiError(409, "conflict", `A flag with key "${body.key}" already exists in this app`);
        }
        throw err;
      }
    })

    .get("/flags/:flagId", async (c) => {
      const flag = await loadFlag(db, c.get("currentUser").id, c.req.param("flagId"));
      return c.json({ flag: await flagDetail(db, flag.id) });
    })

    .patch("/flags/:flagId", validate("json", updateFlagBody), async (c) => {
      const flag = await loadFlag(db, c.get("currentUser").id, c.req.param("flagId"));
      const body = c.req.valid("json");
      const set = {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
      };
      if (Object.keys(set).length > 0) {
        await db.update(flags).set(set).where(eq(flags.id, flag.id));
      }
      return c.json({ flag: await flagDetail(db, flag.id) });
    })

    .post("/flags/:flagId/archive", async (c) => {
      const flag = await loadFlag(db, c.get("currentUser").id, c.req.param("flagId"));
      await db
        .update(flags)
        .set({ archivedAt: new Date() })
        .where(and(eq(flags.id, flag.id), isNull(flags.archivedAt)));
      return c.json({ flag: await flagDetail(db, flag.id) });
    })

    .post("/flags/:flagId/unarchive", async (c) => {
      const flag = await loadFlag(db, c.get("currentUser").id, c.req.param("flagId"));
      await db
        .update(flags)
        .set({ archivedAt: null })
        .where(and(eq(flags.id, flag.id), sql`${flags.archivedAt} is not null`));
      return c.json({ flag: await flagDetail(db, flag.id) });
    })

    .patch(
      "/flags/:flagId/environments/:envId",
      validate("json", updateConfigBody),
      async (c) => {
        const user = c.get("currentUser");
        const { flag, environmentId } = await loadFlagEnvironment(db, user.id, c);
        const body = c.req.valid("json");
        await requireVariations(db, flag.id, {
          offVariationId: body.offVariationId,
          defaultVariationId: body.defaultVariationId,
        });
        await db.transaction(async (tx) => {
          await bumpVersion(tx, flag.id, environmentId, body.version, user.id, {
            ...(body.enabled !== undefined && { enabled: body.enabled }),
            ...(body.offVariationId !== undefined && { offVariationId: body.offVariationId }),
            ...(body.defaultVariationId !== undefined && {
              defaultVariationId: body.defaultVariationId,
            }),
          });
        });
        return c.json({ config: await configWithTargets(db, flag.id, environmentId) });
      },
    )

    .put(
      "/flags/:flagId/environments/:envId/targets/:subjectKey",
      validate("json", putTargetBody),
      async (c) => {
        const user = c.get("currentUser");
        const { flag, environmentId } = await loadFlagEnvironment(db, user.id, c);
        const subjectKey = requireSubjectKey(c.req.param("subjectKey"));
        const body = c.req.valid("json");
        await requireVariations(db, flag.id, { variationId: body.variationId });
        await db.transaction(async (tx) => {
          await bumpVersion(tx, flag.id, environmentId, body.version, user.id);
          await tx
            .insert(flagTargets)
            .values({ flagId: flag.id, environmentId, subjectKey, variationId: body.variationId })
            .onDuplicateKeyUpdate({ set: { variationId: body.variationId } });
        });
        return c.json({ config: await configWithTargets(db, flag.id, environmentId) });
      },
    )

    .delete(
      "/flags/:flagId/environments/:envId/targets/:subjectKey",
      validate("query", deleteTargetQuery),
      async (c) => {
        const user = c.get("currentUser");
        const { flag, environmentId } = await loadFlagEnvironment(db, user.id, c);
        const subjectKey = requireSubjectKey(c.req.param("subjectKey"));
        const { version } = c.req.valid("query");
        await db.transaction(async (tx) => {
          await bumpVersion(tx, flag.id, environmentId, version, user.id);
          const [result] = await tx
            .delete(flagTargets)
            .where(
              and(
                eq(flagTargets.flagId, flag.id),
                eq(flagTargets.environmentId, environmentId),
                eq(flagTargets.subjectKey, subjectKey),
              ),
            );
          // Rolls back the version bump.
          if (result.affectedRows === 0) throw notFound("Target");
        });
        return c.json({ config: await configWithTargets(db, flag.id, environmentId) });
      },
    );
}

/** Loads a flag with its variations, configs, and targets as a `FlagDetail`. */
async function flagDetail(db: Executor, flagId: string) {
  const flag = await db.query.flags.findFirst({
    where: eq(flags.id, flagId),
    with: { variations: true, configs: true, targets: true },
  });
  if (!flag) throw notFound("Flag");
  return toFlagDetail(flag);
}

/** Loads one config and its targets. */
async function configWithTargets(db: Executor, flagId: string, environmentId: string) {
  const where = and(eq(flagConfigs.flagId, flagId), eq(flagConfigs.environmentId, environmentId));
  const [config] = await db.select().from(flagConfigs).where(where);
  if (!config) throw notFound("Flag config");
  const targets = await db
    .select()
    .from(flagTargets)
    .where(and(eq(flagTargets.flagId, flagId), eq(flagTargets.environmentId, environmentId)));
  return toFlagConfigWithTargets(config, targets);
}

/**
 * Loads the `:flagId` flag (membership-guarded) and checks that `:envId`
 * belongs to the same application. Either failing is a `404`.
 */
async function loadFlagEnvironment(
  db: Db,
  userId: string,
  c: { req: { param: (name: "flagId" | "envId") => string } },
): Promise<{ flag: Flag; environmentId: string }> {
  const flag = await loadFlag(db, userId, c.req.param("flagId"));
  const [env] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(
      and(
        eq(environments.id, c.req.param("envId")),
        eq(environments.applicationId, flag.applicationId),
      ),
    );
  if (!env) throw notFound("Environment");
  return { flag, environmentId: env.id };
}

/** Subject keys in paths are 1-255 characters (Hono has already URL-decoded them). */
function requireSubjectKey(subjectKey: string): string {
  if (subjectKey.length < 1 || subjectKey.length > 255) {
    invalid("subjectKey", "Must be 1-255 characters");
  }
  return subjectKey;
}

/** Throws `400` unless every given variation ID belongs to the flag. */
async function requireVariations(
  db: Executor,
  flagId: string,
  ids: Record<string, string | undefined>,
): Promise<void> {
  const given = Object.entries(ids).filter((e): e is [string, string] => e[1] !== undefined);
  if (given.length === 0) return;
  const rows = await db
    .select({ id: flagVariations.id })
    .from(flagVariations)
    .where(eq(flagVariations.flagId, flagId));
  const valid = new Set(rows.map((r) => r.id));
  for (const [field, id] of given) {
    if (!valid.has(id)) invalid(field, "Not a variation of this flag");
  }
}

/**
 * Applies `changes` to a config and increments its version, but only if its
 * current version is `expected`. Otherwise throws `409 version_conflict` with
 * `details.currentVersion`.
 */
async function bumpVersion(
  tx: Executor,
  flagId: string,
  environmentId: string,
  expected: number,
  userId: string,
  changes: Partial<Pick<typeof flagConfigs.$inferInsert, "enabled" | "offVariationId" | "defaultVariationId">> = {},
): Promise<void> {
  const where = and(eq(flagConfigs.flagId, flagId), eq(flagConfigs.environmentId, environmentId));
  const [result] = await tx
    .update(flagConfigs)
    .set({ ...changes, version: sql`${flagConfigs.version} + 1`, updatedBy: userId })
    .where(and(where, eq(flagConfigs.version, expected)));
  if (result.affectedRows === 1) return;

  const [current] = await tx.select({ version: flagConfigs.version }).from(flagConfigs).where(where);
  if (!current) throw notFound("Flag config");
  throw apiError(
    409,
    "version_conflict",
    `The config is at version ${current.version}, not ${expected}. Reload and retry.`,
    { currentVersion: current.version },
  );
}
