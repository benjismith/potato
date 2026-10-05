import { describe, expect, it } from "vitest";
import { InMemoryNonceStore, NONCE_TTL_MS } from "../../src/sdk-auth/nonce-store.js";

const KEY = "key_01JZZTESTKEY00000000000000";

describe("InMemoryNonceStore", () => {
  it("defaults to the 600 s window from SIGNING.md", () => {
    expect(NONCE_TTL_MS).toBe(600_000);
  });

  it("rejects a nonce for the full TTL and accepts it again afterwards", () => {
    const store = new InMemoryNonceStore();
    const t0 = 1_000_000;
    expect(store.checkAndRecord(KEY, "nonce-a", t0)).toBe(true);
    expect(store.checkAndRecord(KEY, "nonce-a", t0 + 1)).toBe(false);
    expect(store.checkAndRecord(KEY, "nonce-a", t0 + NONCE_TTL_MS - 1)).toBe(false);
    expect(store.checkAndRecord(KEY, "nonce-a", t0 + NONCE_TTL_MS)).toBe(true);
  });

  it("a rejected replay does not extend the window", () => {
    const store = new InMemoryNonceStore({ ttlMs: 100 });
    expect(store.checkAndRecord(KEY, "n", 0)).toBe(true);
    expect(store.checkAndRecord(KEY, "n", 99)).toBe(false);
    expect(store.checkAndRecord(KEY, "n", 100)).toBe(true);
  });

  it("evicts expired entries", () => {
    const store = new InMemoryNonceStore({ ttlMs: 100 });
    for (let i = 0; i < 50; i++) store.checkAndRecord(KEY, `n${i}`, i);
    expect(store.size).toBe(50);
    store.checkAndRecord(KEY, "late", 125); // n0..n25 have expired
    expect(store.size).toBe(50 - 26 + 1);
    store.evictExpired(10_000);
    expect(store.size).toBe(0);
  });

  it("does not confuse key/nonce pairs that concatenate alike", () => {
    const store = new InMemoryNonceStore();
    expect(store.checkAndRecord("key_ab", "c", 0)).toBe(true);
    expect(store.checkAndRecord("key_a", "bc", 0)).toBe(true);
  });
});
