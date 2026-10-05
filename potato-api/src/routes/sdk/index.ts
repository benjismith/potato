import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import {
  environments,
  flagConfigs,
  flagTargets,
  flagVariations,
  flags,
  subjects,
} from "../../db/schema.js";
import { evaluateFlags } from "../../domain/evaluate.js";
import { validate } from "../../http/validation.js";
import {
  createDbKeyLookup,
  createKeyUsageRecorder,
  InMemoryNonceStore,
  sdkAuth,
  type SdkAuthEnv,
  type SdkAuthOptions,
} from "../../sdk-auth/index.js";

export interface SdkDeps {
  db: Db;
  /** Overrides for the signature middleware (tests inject a clock or key lookup). */
  sdkAuth?: Partial<SdkAuthOptions>;
}

const evaluateBody = z.object({
  subject: z.object({
    key: z.string().min(1).max(255),
    attributes: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** The SDK API (`/sdk/v1`). Every route requires a signed request (SIGNING.md). */
export function sdkRoutes(deps: SdkDeps) {
  const { db } = deps;
  const app = new Hono<SdkAuthEnv>();

  app.use(
    "*",
    sdkAuth({
      lookupKey: createDbKeyLookup(db),
      nonceStore: new InMemoryNonceStore(),
      markKeyUsed: createKeyUsageRecorder(db),
      ...deps.sdkAuth,
    }),
  );

  app.post("/evaluate", validate("json", evaluateBody), async (c) => {
    const { subject } = c.req.valid("json");
    const environmentId = c.get("environmentId");

    const env = await db.query.environments.findFirst({
      where: eq(environments.id, environmentId),
      columns: { applicationId: true },
    });
    if (!env) return c.json({ flags: {} });

    const flagRows = await db
      .select({ id: flags.id, key: flags.key })
      .from(flags)
      .where(and(eq(flags.applicationId, env.applicationId), isNull(flags.archivedAt)));
    const flagIds = flagRows.map((f) => f.id);

    const [variations, configs, targets] = flagIds.length
      ? await Promise.all([
          db
            .select({ id: flagVariations.id, flagId: flagVariations.flagId, value: flagVariations.value })
            .from(flagVariations)
            .where(inArray(flagVariations.flagId, flagIds)),
          db
            .select({
              flagId: flagConfigs.flagId,
              enabled: flagConfigs.enabled,
              offVariationId: flagConfigs.offVariationId,
              defaultVariationId: flagConfigs.defaultVariationId,
            })
            .from(flagConfigs)
            .where(and(eq(flagConfigs.environmentId, environmentId), inArray(flagConfigs.flagId, flagIds))),
          db
            .select({ flagId: flagTargets.flagId, variationId: flagTargets.variationId })
            .from(flagTargets)
            .where(
              and(eq(flagTargets.environmentId, environmentId), eq(flagTargets.subjectKey, subject.key)),
            ),
        ])
      : [[], [], []];

    const now = new Date();
    const attributes = subject.attributes ?? {};
    await db
      .insert(subjects)
      .values({ environmentId, key: subject.key, attributes, firstSeenAt: now, lastSeenAt: now })
      .onDuplicateKeyUpdate({ set: { attributes, lastSeenAt: now } });

    return c.json({ flags: evaluateFlags({ flags: flagRows, variations, configs, targets }) });
  });

  return app;
}
