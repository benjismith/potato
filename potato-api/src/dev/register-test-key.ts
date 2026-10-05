// DEV ONLY: stands in for signing-key management (task 000007) until it exists.
//
// Registers the TEST-ONLY public key from potato-planning/docs/signing-vectors.json
// against an environment, so potato-sdk can sign requests with the matching
// test private key. Never run this against a real deployment.
//
//   npm run db:dev-key                  # seed app's "development" environment
//   npm run db:dev-key -- production    # or another environment slug of the seed app
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db/client.js";
import { environments, signingKeys } from "../db/schema.js";
import { SEED_IDS } from "../db/seed.js";
import { loadEnv } from "../env.js";

const vectors = JSON.parse(
  readFileSync(new URL("../../../potato-planning/docs/signing-vectors.json", import.meta.url), "utf8"),
) as { keyId: string; publicKeyPem: string };

const envSlug = process.argv[2] ?? "development";
const { db, pool } = createDb(loadEnv().databaseUrl);

try {
  const env = await db.query.environments.findFirst({
    where: and(eq(environments.applicationId, SEED_IDS.app), eq(environments.slug, envSlug)),
  });
  if (!env) throw new Error(`Seed app has no environment "${envSlug}" (run npm run db:seed first)`);

  const existing = await db.query.signingKeys.findFirst({ where: eq(signingKeys.id, vectors.keyId) });
  if (existing) {
    await db
      .update(signingKeys)
      .set({ environmentId: env.id, revokedAt: null })
      .where(eq(signingKeys.id, vectors.keyId));
  } else {
    await db.insert(signingKeys).values({
      id: vectors.keyId,
      environmentId: env.id,
      label: "TEST-ONLY key from signing-vectors.json",
      algorithm: "ed25519",
      publicKeyPem: vectors.publicKeyPem,
      createdBy: SEED_IDS.user,
    });
  }
  console.log(`Test key ${vectors.keyId} is registered to ${envSlug} (${env.id}).`);
} finally {
  await pool.end();
}
