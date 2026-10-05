// The verifier side of potato-planning/docs/SIGNING.md, as a pure function of
// the request and injected dependencies (clock, key lookup, nonce store).
import { createPublicKey, KeyObject, verify } from "node:crypto";
import {
  buildCanonicalString,
  hashBody,
  KEY_ID_HEADER,
  KEY_ID_RE,
  NONCE_HEADER,
  NONCE_RE,
  SIGNATURE_HEADER,
  SIGNATURE_RE,
  TIMESTAMP_HEADER,
  TIMESTAMP_RE,
} from "./canonical.js";
import type { NonceStore } from "./nonce-store.js";

/** `abs(now − timestamp)` must be at most this many seconds. */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

/** The `reason` codes from SIGNING.md's verification table, in check order. */
export const verifyFailureReasons = [
  "missing_or_malformed_headers",
  "stale_timestamp",
  "unknown_key",
  "bad_signature",
  "replayed_nonce",
] as const;
export type VerifyFailureReason = (typeof verifyFailureReasons)[number];

/** A registered, unrevoked signing key, as resolved from its ID. */
export interface SdkKey {
  /** `key_<ULID>` */
  id: string;
  /** The environment the key is scoped to. Requests may only read this environment. */
  environmentId: string;
  /** Ed25519 public key, as an SPKI PEM string or a parsed `KeyObject`. */
  publicKey: string | KeyObject;
}

/**
 * Resolves a key ID to its key. Returns `null` for unknown **and** revoked
 * keys, which deliberately share the `unknown_key` reason.
 */
export type LookupKey = (keyId: string) => Promise<SdkKey | null>;

/** The parts of a received request that verification needs. */
export interface VerifyInput {
  /** The HTTP method as received. It's uppercased for the canonical string. */
  method: string;
  /** Path plus `?query`, exactly as on the request line. */
  target: string;
  /** Request headers (a `Headers` works). */
  headers: { get(name: string): string | null };
  /** The raw body bytes, exactly as received. */
  body: Uint8Array;
}

export interface VerifyDeps {
  /** Current time in epoch milliseconds. */
  now: () => number;
  lookupKey: LookupKey;
  nonceStore: NonceStore;
}

export type VerifyResult =
  | { ok: true; key: SdkKey }
  | { ok: false; status: 401; reason: VerifyFailureReason };

const fail = (reason: VerifyFailureReason): VerifyResult => ({ ok: false, status: 401, reason });

/**
 * Verifies a signed SDK request, running SIGNING.md's checks in order and
 * stopping at the first failure. The nonce is recorded only once the
 * signature has verified.
 *
 * Throws (rather than returning a failure) only on server-side faults: a
 * failing `lookupKey` or nonce store, or a stored key that isn't a valid
 * Ed25519 public key.
 */
export async function verifyRequest(input: VerifyInput, deps: VerifyDeps): Promise<VerifyResult> {
  // 1. All four headers present and well-formed.
  const keyId = input.headers.get(KEY_ID_HEADER);
  const timestamp = input.headers.get(TIMESTAMP_HEADER);
  const nonce = input.headers.get(NONCE_HEADER);
  const signature = input.headers.get(SIGNATURE_HEADER);
  if (
    keyId === null ||
    timestamp === null ||
    nonce === null ||
    signature === null ||
    !KEY_ID_RE.test(keyId) ||
    !TIMESTAMP_RE.test(timestamp) ||
    !NONCE_RE.test(nonce) ||
    !SIGNATURE_RE.test(signature)
  ) {
    return fail("missing_or_malformed_headers");
  }

  // 2. Timestamp within ±300 s. A huge digit string parses to a huge (or
  // infinite) number and fails this check too.
  const nowMs = deps.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!(Math.abs(nowSeconds - Number(timestamp)) <= TIMESTAMP_TOLERANCE_SECONDS)) {
    return fail("stale_timestamp");
  }

  // 3. Key exists and isn't revoked.
  const key = await deps.lookupKey(keyId);
  if (!key) return fail("unknown_key");

  // 4. Signature over the canonical string, built from the request as received.
  let canonical: string;
  try {
    canonical = buildCanonicalString({
      keyId,
      method: input.method,
      target: input.target,
      timestamp,
      nonce,
      bodySha256: hashBody(input.body),
    });
  } catch {
    // A method or target that no conforming signer could have signed.
    return fail("bad_signature");
  }
  const publicKey = toEd25519PublicKey(key);
  const signatureBytes = Buffer.from(signature, "base64url");
  if (!verify(null, Buffer.from(canonical, "utf8"), publicKey, signatureBytes)) {
    return fail("bad_signature");
  }

  // 5. Nonce not seen in the last 600 s; recorded now that the signature is good.
  if (!(await deps.nonceStore.checkAndRecord(keyId, nonce, nowMs))) {
    return fail("replayed_nonce");
  }

  return { ok: true, key };
}

function toEd25519PublicKey(key: SdkKey): KeyObject {
  const publicKey =
    key.publicKey instanceof KeyObject
      ? key.publicKey
      : createPublicKey({ key: key.publicKey, format: "pem" });
  if (publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`Signing key ${key.id} is not an Ed25519 public key`);
  }
  return publicKey;
}
