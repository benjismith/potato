import { asc, eq, inArray } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import {
  environments,
  flagConfigs,
  flags,
  flagVariations,
  type Environment,
} from "../db/schema.js";
import { newId } from "../ids.js";
import { defaultConfigVariations } from "./flags.js";

/** The environments every new application starts with, in creation order. */
export const DEFAULT_ENVIRONMENTS = [
  { slug: "development", name: "Development" },
  { slug: "production", name: "Production" },
] as const;

/**
 * Creates an environment, plus a config for every flag in its application
 * (archived or not), so each (flag, environment) pair has exactly one config.
 * Run it inside a transaction.
 */
export async function createEnvironment(
  tx: Executor,
  input: { applicationId: string; slug: string; name: string; userId: string },
): Promise<Environment> {
  const id = newId("env");
  await tx.insert(environments).values({
    id,
    applicationId: input.applicationId,
    slug: input.slug,
    name: input.name,
  });

  const appFlags = await tx
    .select({ id: flags.id })
    .from(flags)
    .where(eq(flags.applicationId, input.applicationId));
  if (appFlags.length > 0) {
    const variations = await tx
      .select({ id: flagVariations.id, flagId: flagVariations.flagId })
      .from(flagVariations)
      .where(inArray(flagVariations.flagId, appFlags.map((f) => f.id)))
      .orderBy(asc(flagVariations.sortOrder), asc(flagVariations.id));
    await tx.insert(flagConfigs).values(
      appFlags.map((flag) => {
        const { offVariationId, defaultVariationId } = defaultConfigVariations(
          variations.filter((v) => v.flagId === flag.id),
        );
        return {
          flagId: flag.id,
          environmentId: id,
          offVariationId,
          defaultVariationId,
          updatedBy: input.userId,
        };
      }),
    );
  }

  const [env] = await tx.select().from(environments).where(eq(environments.id, id));
  return env!;
}
