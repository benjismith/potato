/** The nonce window from SIGNING.md: a `(key id, nonce)` pair is remembered this long. */
export const NONCE_TTL_MS = 600_000;

/**
 * Remembers `(key id, nonce)` pairs to reject replays. The verifier calls it
 * only after a signature verifies, so unauthenticated traffic can't fill it.
 *
 * Async-capable so a shared store (MySQL, Redis) can replace the in-memory
 * one when the API runs as several instances.
 */
export interface NonceStore {
  /**
   * Atomically checks and records a nonce. Returns `true` if the pair was not
   * seen within the TTL (and is now recorded), or `false` if it's a replay.
   *
   * @param nowMs the current time in epoch milliseconds
   */
  checkAndRecord(keyId: string, nonce: string, nowMs: number): boolean | Promise<boolean>;
}

/**
 * A single-process nonce store with TTL eviction. Every entry has the same
 * TTL, so a Map's insertion order is also expiry order (given a clock that
 * doesn't run backwards), and eviction just trims expired entries from the
 * front on each call.
 */
export class InMemoryNonceStore implements NonceStore {
  readonly #ttlMs: number;
  /** `keyId + "\n" + nonce` → expiry time in epoch ms. */
  readonly #expiries = new Map<string, number>();

  constructor(options: { ttlMs?: number } = {}) {
    this.#ttlMs = options.ttlMs ?? NONCE_TTL_MS;
  }

  /** The number of entries currently held (including any not yet evicted). */
  get size(): number {
    return this.#expiries.size;
  }

  checkAndRecord(keyId: string, nonce: string, nowMs: number): boolean {
    this.evictExpired(nowMs);
    // Neither field can contain "\n" (both are header-regex validated).
    const entry = `${keyId}\n${nonce}`;
    const expiresAt = this.#expiries.get(entry);
    if (expiresAt !== undefined && expiresAt > nowMs) return false;
    // Delete first so a re-recorded entry moves to the back of the order.
    this.#expiries.delete(entry);
    this.#expiries.set(entry, nowMs + this.#ttlMs);
    return true;
  }

  /** Drops expired entries from the front of the insertion order. */
  evictExpired(nowMs: number): void {
    for (const [entry, expiresAt] of this.#expiries) {
      if (expiresAt > nowMs) break;
      this.#expiries.delete(entry);
    }
  }
}
