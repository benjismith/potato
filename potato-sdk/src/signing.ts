/**
 * Request signing for the Potato SDK API, implementing the signer side of
 * potato-planning/docs/SIGNING.md.
 */
import {
  createHash,
  createPrivateKey,
  KeyObject,
  randomBytes,
  sign,
} from "node:crypto";

/** The version tag that starts every canonical string. */
export const SIGNING_VERSION = "POTATO-ED25519-V1";

export const KEY_ID_HEADER = "X-Potato-Key-Id";
export const TIMESTAMP_HEADER = "X-Potato-Timestamp";
export const NONCE_HEADER = "X-Potato-Nonce";
export const SIGNATURE_HEADER = "X-Potato-Signature";

/** The four headers that authenticate a request to the SDK API. */
export interface SignedHeaders {
  [KEY_ID_HEADER]: string;
  [TIMESTAMP_HEADER]: string;
  [NONCE_HEADER]: string;
  [SIGNATURE_HEADER]: string;
}

export interface CanonicalFields {
  /** Registered key ID, `key_` + 26-char ULID. */
  keyId: string;
  /** HTTP method. Uppercased in the canonical string. */
  method: string;
  /** Path plus `?query`, exactly as sent on the request line. */
  target: string;
  /** Unix time in seconds. */
  timestamp: number | string;
  /** 16–64 chars of `[A-Za-z0-9_-]`. */
  nonce: string;
  /** Lowercase hex SHA-256 of the raw body bytes. */
  bodySha256: string;
}

export interface SignRequestOptions {
  keyId: string;
  /** Ed25519 private key, as a PKCS#8 PEM string or a `KeyObject`. */
  privateKey: string | KeyObject;
  method: string;
  /** Path plus `?query`, exactly as it will be sent. */
  target: string;
  /**
   * The exact body that will be sent. Strings are encoded as UTF-8. Omit (or
   * pass `""`) for an empty body.
   */
  body?: string | Uint8Array;
  /** Current time in epoch milliseconds (as from `Date.now()`). For tests. */
  now?: number;
  /** Nonce to use instead of a fresh random one. For tests. */
  nonce?: string;
}

const KEY_ID_RE = /^key_[0-9A-HJKMNP-TV-Z]{26}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TIMESTAMP_RE = /^(0|[1-9][0-9]*)$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const METHOD_RE = /^[A-Za-z]+$/;

/** Lowercase hex SHA-256 of the body bytes (strings are UTF-8 encoded). */
export function hashBody(body: string | Uint8Array = ""): string {
  const hash = createHash("sha256");
  if (typeof body === "string") hash.update(body, "utf8");
  else hash.update(body);
  return hash.digest("hex");
}

/** Builds the canonical string defined in SIGNING.md. Throws on malformed fields. */
export function buildCanonicalString(fields: CanonicalFields): string {
  const { keyId, method, target, nonce, bodySha256 } = fields;
  const timestamp = String(fields.timestamp);
  if (!KEY_ID_RE.test(keyId)) {
    throw new TypeError(`Invalid key ID ${JSON.stringify(keyId)}: expected "key_" followed by a 26-char ULID`);
  }
  if (!METHOD_RE.test(method)) {
    throw new TypeError(`Invalid HTTP method ${JSON.stringify(method)}`);
  }
  if (!target.startsWith("/") || /\s/.test(target)) {
    throw new TypeError(`Invalid request target ${JSON.stringify(target)}: expected a path starting with "/" and no whitespace`);
  }
  if (!TIMESTAMP_RE.test(timestamp)) {
    throw new TypeError(`Invalid timestamp ${JSON.stringify(timestamp)}: expected non-negative integer Unix seconds`);
  }
  if (!NONCE_RE.test(nonce)) {
    throw new TypeError(`Invalid nonce ${JSON.stringify(nonce)}: expected 16-64 chars of [A-Za-z0-9_-]`);
  }
  if (!SHA256_HEX_RE.test(bodySha256)) {
    throw new TypeError(`Invalid body hash ${JSON.stringify(bodySha256)}: expected 64 lowercase hex chars`);
  }
  return [SIGNING_VERSION, keyId, method.toUpperCase(), target, timestamp, nonce, bodySha256].join("\n");
}

/**
 * Parses and validates an Ed25519 private key. Accepts a PKCS#8 PEM string or
 * a `KeyObject`. Throws a descriptive `TypeError` for public keys, non-Ed25519
 * keys, and unparseable input. Use this to validate a key once up front.
 */
export function loadPrivateKey(privateKey: string | KeyObject): KeyObject {
  let key: KeyObject;
  if (privateKey instanceof KeyObject) {
    key = privateKey;
  } else if (typeof privateKey === "string") {
    if (/-----BEGIN [A-Z ]*PUBLIC KEY-----/.test(privateKey)) {
      throw new TypeError("Potato signing key must be an Ed25519 private key, but a public key PEM was given");
    }
    try {
      key = createPrivateKey({ key: privateKey, format: "pem" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new TypeError(`Could not parse Potato signing key as a PKCS#8 PEM private key: ${reason}`);
    }
  } else {
    throw new TypeError("Potato signing key must be a PKCS#8 PEM string or a KeyObject");
  }
  if (key.type !== "private") {
    throw new TypeError(`Potato signing key must be an Ed25519 private key, but a ${key.type} key was given`);
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new TypeError(
      `Potato signing key must be an Ed25519 private key, but a ${key.asymmetricKeyType ?? "unknown"} key was given`,
    );
  }
  return key;
}

/** A fresh nonce: 16 random bytes, base64url-encoded (22 chars). */
export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Signs a request and returns the four `X-Potato-*` headers. The caller must
 * send exactly `body` (the same bytes) to exactly `target`.
 */
export function signRequest(options: SignRequestOptions): SignedHeaders {
  const key = loadPrivateKey(options.privateKey);
  const timestamp = String(Math.floor((options.now ?? Date.now()) / 1000));
  const nonce = options.nonce ?? generateNonce();
  const canonical = buildCanonicalString({
    keyId: options.keyId,
    method: options.method,
    target: options.target,
    timestamp,
    nonce,
    bodySha256: hashBody(options.body),
  });
  const signature = sign(null, Buffer.from(canonical, "utf8"), key).toString("base64url");
  return {
    [KEY_ID_HEADER]: options.keyId,
    [TIMESTAMP_HEADER]: timestamp,
    [NONCE_HEADER]: nonce,
    [SIGNATURE_HEADER]: signature,
  };
}
