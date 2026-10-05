// The canonical string and header formats from
// potato-planning/docs/SIGNING.md. This must agree byte for byte with the
// signer in potato-sdk/src/signing.ts; signing-vectors.json is the arbiter.
import { createHash } from "node:crypto";

/** The version tag that starts every canonical string. */
export const SIGNING_VERSION = "POTATO-ED25519-V1";

export const KEY_ID_HEADER = "X-Potato-Key-Id";
export const TIMESTAMP_HEADER = "X-Potato-Timestamp";
export const NONCE_HEADER = "X-Potato-Nonce";
export const SIGNATURE_HEADER = "X-Potato-Signature";

/** `key_` + 26-char ULID in uppercase Crockford Base32. */
export const KEY_ID_RE = /^key_[0-9A-HJKMNP-TV-Z]{26}$/;
/** Unix seconds: base-10, no sign, no leading zeros. */
export const TIMESTAMP_RE = /^(0|[1-9][0-9]*)$/;
/** 16–64 chars of `[A-Za-z0-9_-]`. */
export const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
/**
 * Unpadded base64url of exactly 64 bytes: 86 chars, where the last char
 * carries 2 data bits and 4 zero bits (so only `A`, `Q`, `g`, `w`). This
 * rejects non-canonical encodings that would decode to the same bytes.
 */
export const SIGNATURE_RE = /^[A-Za-z0-9_-]{85}[AQgw]$/;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const METHOD_RE = /^[A-Za-z]+$/;

/** The fields covered by the signature. */
export interface CanonicalFields {
  /** Registered key ID, `key_` + 26-char ULID. */
  keyId: string;
  /** HTTP method. Uppercased in the canonical string. */
  method: string;
  /** Path plus `?query`, exactly as on the request line. */
  target: string;
  /** Unix time in seconds. */
  timestamp: number | string;
  /** 16–64 chars of `[A-Za-z0-9_-]`. */
  nonce: string;
  /** Lowercase hex SHA-256 of the raw body bytes. */
  bodySha256: string;
}

/** Lowercase hex SHA-256 of the body bytes (strings are UTF-8 encoded). */
export function hashBody(body: string | Uint8Array = ""): string {
  const hash = createHash("sha256");
  if (typeof body === "string") hash.update(body, "utf8");
  else hash.update(body);
  return hash.digest("hex");
}

/** Builds the canonical string defined in SIGNING.md. Throws a `TypeError` on malformed fields. */
export function buildCanonicalString(fields: CanonicalFields): string {
  const { keyId, method, target, nonce, bodySha256 } = fields;
  const timestamp = String(fields.timestamp);
  if (!KEY_ID_RE.test(keyId)) {
    throw new TypeError(`Invalid key ID ${JSON.stringify(keyId)}`);
  }
  if (!METHOD_RE.test(method)) {
    throw new TypeError(`Invalid HTTP method ${JSON.stringify(method)}`);
  }
  if (!target.startsWith("/") || /\s/.test(target)) {
    throw new TypeError(`Invalid request target ${JSON.stringify(target)}`);
  }
  if (!TIMESTAMP_RE.test(timestamp)) {
    throw new TypeError(`Invalid timestamp ${JSON.stringify(timestamp)}`);
  }
  if (!NONCE_RE.test(nonce)) {
    throw new TypeError(`Invalid nonce ${JSON.stringify(nonce)}`);
  }
  if (!SHA256_HEX_RE.test(bodySha256)) {
    throw new TypeError(`Invalid body hash ${JSON.stringify(bodySha256)}`);
  }
  return [SIGNING_VERSION, keyId, method.toUpperCase(), target, timestamp, nonce, bodySha256].join("\n");
}
