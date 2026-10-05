import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import {
  applications,
  environments,
  organizations,
  signingKeys,
  users,
} from "../../src/db/schema.js";
import { createDbKeyLookup, createKeyUsageRecorder, LAST_USED_INTERVAL_MS } from "../../src/sdk-auth/keys.js";
import { InMemoryNonceStore } from "../../src/sdk-auth/nonce-store.js";
import { verifyRequest } from "../../src/sdk-auth/verify.js";
import { useTestDb } from "../support/db.js";
import { headersOf, msAt, utf8, vectorHeaders, vectors } from "./support.js";

const testDb = useTestDb();

const ENV = "env_01JZZSIGTESTENV0000000000";
const REVOKED_KEY = "key_01JZZREV0KEDKEY00000000000";

/** A tenant with one environment, holding the vectors' key and a revoked key. */
async function seed(db: Db) {
  await db.insert(users).values({ id: "usr_sig", email: "sig@example.com", name: "Sig" });
  await db.insert(organizations).values({ id: "org_sig", slug: "sig", name: "Sig" });
  await db.insert(applications).values({ id: "app_sig", orgId: "org_sig", slug: "web", name: "Web" });
  await db.insert(environments).values({ id: ENV, applicationId: "app_sig", slug: "production", name: "Production" });
  await db.insert(signingKeys).values([
    {
      id: vectors.keyId,
      environmentId: ENV,
      label: "test vectors",
      algorithm: "ed25519",
      publicKeyPem: vectors.publicKeyPem,
      createdBy: "usr_sig",
    },
    {
      id: REVOKED_KEY,
      environmentId: ENV,
      label: "revoked",
      algorithm: "ed25519",
      publicKeyPem: vectors.publicKeyPem,
      createdBy: "usr_sig",
      revokedAt: new Date("2025-12-01T00:00:00Z"),
    },
  ]);
}

async function lastUsedAt(db: Db, keyId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastUsedAt: signingKeys.lastUsedAt })
    .from(signingKeys)
    .where(eq(signingKeys.id, keyId));
  return row!.lastUsedAt;
}

beforeEach(async () => {
  await seed(testDb.db);
});

describe("createDbKeyLookup", () => {
  it("resolves an active key to its environment and public key", async () => {
    const lookup = createDbKeyLookup(testDb.db);
    expect(await lookup(vectors.keyId)).toEqual({
      id: vectors.keyId,
      environmentId: ENV,
      publicKey: vectors.publicKeyPem,
    });
  });

  it("returns null for unknown and revoked keys alike", async () => {
    const lookup = createDbKeyLookup(testDb.db);
    expect(await lookup("key_01JZZNOSUCHKEY000000000000")).toBeNull();
    expect(await lookup(REVOKED_KEY)).toBeNull();
  });

  it("makes verifyRequest succeed for an active key and report unknown_key for a revoked one", async () => {
    const c = vectors.cases[0]!;
    const deps = {
      now: () => msAt(c.timestamp),
      lookupKey: createDbKeyLookup(testDb.db),
      nonceStore: new InMemoryNonceStore(),
    };
    const input = { method: c.method, target: c.path, headers: headersOf(vectorHeaders(c)), body: utf8(c.body) };

    // The revoked key holds the same public key, so only revocation can fail it.
    const revoked = headersOf({ ...vectorHeaders(c), "X-Potato-Key-Id": REVOKED_KEY });
    expect(await verifyRequest({ ...input, headers: revoked }, deps)).toEqual({
      ok: false,
      status: 401,
      reason: "unknown_key",
    });

    const result = await verifyRequest(input, deps);
    expect(result.ok && result.key.environmentId).toBe(ENV);
  });
});

describe("createKeyUsageRecorder", () => {
  const T0 = Date.parse("2026-01-01T00:00:00.000Z");

  it("writes last_used_at at most once per minute per key", async () => {
    let now = T0;
    const markKeyUsed = createKeyUsageRecorder(testDb.db, { now: () => now });
    expect(LAST_USED_INTERVAL_MS).toBe(60_000);

    expect(await lastUsedAt(testDb.db, vectors.keyId)).toBeNull();
    await markKeyUsed(vectors.keyId);
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0));

    now = T0 + 30_000;
    await markKeyUsed(vectors.keyId);
    now = T0 + 59_999;
    await markKeyUsed(vectors.keyId);
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0));

    now = T0 + 60_000;
    await markKeyUsed(vectors.keyId);
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0 + 60_000));
  });

  it("throttles each key independently", async () => {
    let now = T0;
    const markKeyUsed = createKeyUsageRecorder(testDb.db, { now: () => now });
    await markKeyUsed(vectors.keyId);
    now = T0 + 1_000;
    await markKeyUsed(REVOKED_KEY);
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0));
    expect(await lastUsedAt(testDb.db, REVOKED_KEY)).toEqual(new Date(T0 + 1_000));
  });

  it("the UPDATE's own condition throttles across processes", async () => {
    let now = T0;
    const processA = createKeyUsageRecorder(testDb.db, { now: () => now });
    const processB = createKeyUsageRecorder(testDb.db, { now: () => now });
    await processA(vectors.keyId);
    now = T0 + 10_000;
    await processB(vectors.keyId); // B hasn't written yet, but the row is recent
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0));
    now = T0 + 70_000; // B reserved its own slot at +10 s
    await processB(vectors.keyId);
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0 + 70_000));
  });

  it("concurrent calls for one key issue a single write", async () => {
    const markKeyUsed = createKeyUsageRecorder(testDb.db, { now: () => T0 });
    await Promise.all(Array.from({ length: 5 }, () => markKeyUsed(vectors.keyId)));
    expect(await lastUsedAt(testDb.db, vectors.keyId)).toEqual(new Date(T0));
  });
});
