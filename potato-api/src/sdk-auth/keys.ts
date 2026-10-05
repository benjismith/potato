// DB access for SDK request verification: resolving key IDs, and recording
// when a key was last used.
import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { Executor } from "../db/client.js";
import { signingKeys } from "../db/schema.js";
import type { LookupKey, SdkKey } from "./verify.js";

/**
 * A `LookupKey` backed by the `signing_keys` table. Unknown and revoked keys
 * both resolve to `null`.
 */
export function createDbKeyLookup(db: Executor): LookupKey {
  return async (keyId: string): Promise<SdkKey | null> => {
    const [row] = await db
      .select({
        id: signingKeys.id,
        environmentId: signingKeys.environmentId,
        algorithm: signingKeys.algorithm,
        publicKeyPem: signingKeys.publicKeyPem,
      })
      .from(signingKeys)
      .where(and(eq(signingKeys.id, keyId), isNull(signingKeys.revokedAt)))
      .limit(1);
    if (!row || row.algorithm !== "ed25519") return null;
    return { id: row.id, environmentId: row.environmentId, publicKey: row.publicKeyPem };
  };
}

/** `last_used_at` is written at most this often per key. */
export const LAST_USED_INTERVAL_MS = 60_000;

/** Records that a key was just used. */
export type MarkKeyUsed = (keyId: string) => Promise<void>;

export interface KeyUsageOptions {
  /** Current time in epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /** Minimum time between writes for one key. Defaults to one minute. */
  intervalMs?: number;
}

/**
 * Returns a `MarkKeyUsed` that writes `signing_keys.last_used_at` at most
 * once per interval per key.
 *
 * The throttle is two-level: an in-process map skips the query entirely for
 * keys written recently, and the `UPDATE`'s `WHERE` clause skips the write if
 * `last_used_at` is already recent (which keeps it correct across several API
 * processes, too).
 */
export function createKeyUsageRecorder(db: Executor, options: KeyUsageOptions = {}): MarkKeyUsed {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? LAST_USED_INTERVAL_MS;
  /** keyId → time (epoch ms) this process last wrote, or skipped writing, it. */
  const lastWritten = new Map<string, number>();

  return async (keyId: string): Promise<void> => {
    const nowMs = now();
    const previous = lastWritten.get(keyId);
    if (previous !== undefined && nowMs - previous < intervalMs) return;

    // Reserve the slot before awaiting, so concurrent requests don't all write.
    lastWritten.set(keyId, nowMs);
    for (const [id, at] of lastWritten) {
      if (nowMs - at >= intervalMs && id !== keyId) lastWritten.delete(id);
    }

    const usedAt = new Date(nowMs);
    const threshold = new Date(nowMs - intervalMs);
    try {
      await db
        .update(signingKeys)
        .set({ lastUsedAt: usedAt })
        .where(
          and(
            eq(signingKeys.id, keyId),
            or(isNull(signingKeys.lastUsedAt), lte(signingKeys.lastUsedAt, threshold)),
          ),
        );
    } catch (err) {
      // Let a later request retry.
      if (lastWritten.get(keyId) === nowMs) lastWritten.delete(keyId);
      throw err;
    }
  };
}
