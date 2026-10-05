import { readFileSync } from "node:fs";
import { sign } from "node:crypto";
import {
  buildCanonicalString,
  hashBody,
  KEY_ID_HEADER,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "../../src/sdk-auth/canonical.js";
import type { LookupKey, SdkKey } from "../../src/sdk-auth/verify.js";

export interface VectorCase {
  name: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
  bodySha256: string;
  canonical: string;
  signature: string;
}

export interface Vectors {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  cases: VectorCase[];
}

/** The shared vectors, loaded by path relative to the monorepo root. */
export const vectors: Vectors = JSON.parse(
  readFileSync(
    new URL("../../../potato-planning/docs/signing-vectors.json", import.meta.url),
    "utf8",
  ),
) as Vectors;

export const ENV_ID = "env_01JZZTESTENV0000000000000";

/** The vectors' key, scoped to ENV_ID. */
export const testKey: SdkKey = {
  id: vectors.keyId,
  environmentId: ENV_ID,
  publicKey: vectors.publicKeyPem,
};

/** A lookup that knows only the given keys. */
export function lookupFrom(...keys: SdkKey[]): LookupKey {
  return async (keyId) => keys.find((k) => k.id === keyId) ?? null;
}

/** Epoch ms for a Unix-seconds timestamp string. */
export const msAt = (timestamp: string | number) => Number(timestamp) * 1000;

/** Headers as a `Headers`-compatible getter. */
export function headersOf(record: Record<string, string>): Headers {
  return new Headers(record);
}

/** The four signing headers for a vector case, verbatim. */
export function vectorHeaders(c: VectorCase): Record<string, string> {
  return {
    [KEY_ID_HEADER]: vectors.keyId,
    [TIMESTAMP_HEADER]: c.timestamp,
    [NONCE_HEADER]: c.nonce,
    [SIGNATURE_HEADER]: c.signature,
  };
}

export interface SignOptions {
  method: string;
  target: string;
  body?: string | Uint8Array;
  timestamp: string;
  nonce: string;
  keyId?: string;
  privateKeyPem?: string;
}

/** Signs a request with the test key (or another), returning the four headers. */
export function signHeaders(o: SignOptions): Record<string, string> {
  const keyId = o.keyId ?? vectors.keyId;
  const canonical = buildCanonicalString({
    keyId,
    method: o.method,
    target: o.target,
    timestamp: o.timestamp,
    nonce: o.nonce,
    bodySha256: hashBody(o.body ?? ""),
  });
  const signature = sign(null, Buffer.from(canonical, "utf8"), o.privateKeyPem ?? vectors.privateKeyPem);
  return {
    [KEY_ID_HEADER]: keyId,
    [TIMESTAMP_HEADER]: o.timestamp,
    [NONCE_HEADER]: o.nonce,
    [SIGNATURE_HEADER]: signature.toString("base64url"),
  };
}

const encoder = new TextEncoder();
export const utf8 = (s: string) => encoder.encode(s);

/** Generates distinct valid nonces. */
let nonceCounter = 0;
export function freshNonce(): string {
  nonceCounter += 1;
  return `test-nonce-${String(nonceCounter).padStart(8, "0")}`;
}
