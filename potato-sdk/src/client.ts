/**
 * The Potato SDK client: `createPotatoClient()` and `client.evaluate()`.
 *
 * Calls `POST /sdk/v1/evaluate` (see potato-planning/docs/SIGNING.md and the
 * 000009 endpoint contract), signing every request with the customer's
 * Ed25519 private key.
 */
import type { KeyObject } from "node:crypto";
import { KEY_ID_RE, loadPrivateKey, signRequest } from "./signing.js";

/** The SDK's own version, kept in sync with package.json. */
export const SDK_VERSION = "0.1.0";

/** Path of the evaluation endpoint, relative to `apiUrl`. */
export const EVALUATE_PATH = "/sdk/v1/evaluate";

/** Default per-request timeout, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 5000;

/** Max subject key length accepted by the API. */
const MAX_SUBJECT_KEY_LENGTH = 255;

/** A flag value as served by the API (any JSON value). */
export type FlagValue = null | boolean | number | string | FlagValue[] | { [key: string]: FlagValue };

/** The thing flags are evaluated for, usually a user. */
export interface Subject {
  /** Stable, non-empty identifier (≤ 255 chars), e.g. a user ID. */
  key: string;
  /** Arbitrary JSON attributes. Stored by the API; unused by v1 evaluation. */
  attributes?: Record<string, unknown>;
}

export interface PotatoClientOptions {
  /**
   * Base URL of the Potato API, e.g. `https://potato.example.com` or
   * `https://example.com/potato` (a base path is kept and signed).
   */
  apiUrl: string;
  /** Registered key ID, `key_` + 26-char ULID. */
  keyId: string;
  /** Ed25519 private key, as a PKCS#8 PEM string or a `KeyObject`. */
  privateKey: string | KeyObject;
  /** Per-request timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
  /** `fetch` implementation. Defaults to `globalThis.fetch` (read at call time). */
  fetch?: typeof globalThis.fetch;
}

export interface PotatoClient {
  /** Evaluates every flag in the key's environment for `subject`. */
  evaluate(subject: Subject): Promise<PotatoFlags>;
}

/** Error codes the SDK assigns when the server didn't supply one. */
export type PotatoClientErrorCode = "network_error" | "timeout" | "invalid_response" | "http_error";

/**
 * Any failure of a Potato API call. `status` is the HTTP status, or `null` if
 * no response arrived (network error or timeout).
 */
export class PotatoError extends Error {
  override readonly name = "PotatoError";
  /** HTTP status, or `null` when there was no response. */
  readonly status: number | null;
  /**
   * Machine-readable code: the server's `error` (e.g. `unauthorized`) when it
   * sent one, otherwise one of `network_error`, `timeout`,
   * `invalid_response`, `http_error`.
   */
  readonly error: string;
  /** The server's `reason` for `401`s, e.g. `stale_timestamp` or `bad_signature`. */
  readonly reason: string | undefined;
  /** The server's `details` for validation errors, if any. */
  readonly details: unknown;

  constructor(
    message: string,
    init: { status: number | null; error: string; reason?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.status = init.status;
    this.error = init.error;
    this.reason = init.reason;
    this.details = init.details;
  }
}

/** An immutable snapshot of evaluated flag values. */
export class PotatoFlags {
  readonly #values: ReadonlyMap<string, FlagValue>;

  constructor(values: Record<string, FlagValue>) {
    this.#values = new Map(Object.entries(values));
  }

  /**
   * Returns the flag's value, or `fallback` if the flag is unknown or its
   * value's JSON type doesn't match the fallback's (boolean, number, string,
   * array, or object). A `null` fallback accepts any value.
   */
  get<T>(key: string, fallback: T): T {
    if (!this.#values.has(key)) return fallback;
    const value = this.#values.get(key);
    if (fallback === null || fallback === undefined) return value as T;
    return jsonType(value) === jsonType(fallback) ? (value as T) : fallback;
  }

  /** Whether the flag was returned by the API. */
  has(key: string): boolean {
    return this.#values.has(key);
  }

  /** Every returned flag key. */
  keys(): string[] {
    return [...this.#values.keys()];
  }

  /** The raw `{ flagKey: value }` map (a fresh copy). */
  toJSON(): Record<string, FlagValue> {
    return Object.fromEntries(this.#values);
  }
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses and normalizes `apiUrl`: http(s) only, no credentials, query, or
 * fragment, and no trailing slash. Returns the URL the evaluate request hits.
 */
function resolveEvaluateUrl(apiUrl: string): URL {
  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new TypeError("Potato apiUrl must be a non-empty string");
  }
  let base: URL;
  try {
    base = new URL(apiUrl.trim());
  } catch {
    throw new TypeError(`Potato apiUrl ${JSON.stringify(apiUrl)} is not a valid absolute URL`);
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new TypeError(`Potato apiUrl must use http or https, got ${JSON.stringify(base.protocol)}`);
  }
  if (base.username || base.password) {
    throw new TypeError("Potato apiUrl must not contain credentials");
  }
  if (base.search || base.hash || apiUrl.trim().endsWith("?") || apiUrl.trim().endsWith("#")) {
    throw new TypeError("Potato apiUrl must not contain a query string or fragment");
  }
  const basePath = base.pathname.replace(/\/+$/, "");
  return new URL(`${base.origin}${basePath}${EVALUATE_PATH}`);
}

function validateSubject(subject: Subject): void {
  if (!isPlainObject(subject)) {
    throw new TypeError("Potato subject must be an object like { key: string, attributes?: object }");
  }
  if (typeof subject.key !== "string" || subject.key.length === 0) {
    throw new TypeError("Potato subject.key must be a non-empty string");
  }
  if (subject.key.length > MAX_SUBJECT_KEY_LENGTH) {
    throw new TypeError(`Potato subject.key must be at most ${MAX_SUBJECT_KEY_LENGTH} characters`);
  }
  if (subject.attributes !== undefined && !isPlainObject(subject.attributes)) {
    throw new TypeError("Potato subject.attributes must be an object if given");
  }
}

/**
 * Creates a client. Validates the configuration eagerly (key ID format,
 * private key, `apiUrl`, `timeoutMs`) and throws a `TypeError` if it's wrong.
 */
export function createPotatoClient(options: PotatoClientOptions): PotatoClient {
  if (!isPlainObject(options)) throw new TypeError("createPotatoClient requires an options object");
  const { keyId, timeoutMs = DEFAULT_TIMEOUT_MS, fetch: fetchOption } = options;
  if (typeof keyId !== "string" || !KEY_ID_RE.test(keyId)) {
    throw new TypeError(`Invalid Potato keyId ${JSON.stringify(keyId)}: expected "key_" followed by a 26-char ULID`);
  }
  const privateKey = loadPrivateKey(options.privateKey);
  const url = resolveEvaluateUrl(options.apiUrl);
  // The signed target is exactly what goes on the request line (base path included).
  const target = url.pathname + url.search;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`Potato timeoutMs must be a positive number, got ${String(timeoutMs)}`);
  }
  if (fetchOption !== undefined && typeof fetchOption !== "function") {
    throw new TypeError("Potato fetch option must be a function");
  }

  return {
    async evaluate(subject: Subject): Promise<PotatoFlags> {
      validateSubject(subject);
      const payload: Subject = { key: subject.key };
      if (subject.attributes !== undefined) payload.attributes = subject.attributes;
      // Serialize once; sign and send these exact bytes.
      const body = JSON.stringify({ subject: payload });
      const method = "POST";
      const signed = signRequest({ keyId, privateKey, method, target, body });
      const fetchImpl = fetchOption ?? globalThis.fetch;

      let response: Response;
      let text: string;
      try {
        response = await fetchImpl(url.href, {
          method,
          headers: {
            ...signed,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": `potato-sdk-node/${SDK_VERSION}`,
          },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        text = await response.text();
      } catch (err) {
        if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
          throw new PotatoError(`Potato request timed out after ${timeoutMs} ms`, {
            status: null,
            error: "timeout",
            cause: err,
          });
        }
        let detail = err instanceof Error ? err.message : String(err);
        // Node's fetch hides the real cause (e.g. ECONNREFUSED) behind "fetch failed".
        const inner = err instanceof Error ? err.cause : undefined;
        if (inner instanceof Error && inner.message) detail += ` (${inner.message})`;
        throw new PotatoError(`Potato request failed: ${detail}`, { status: null, error: "network_error", cause: err });
      }

      let json: unknown;
      let parseError: unknown;
      try {
        json = JSON.parse(text);
      } catch (err) {
        parseError = err;
      }

      if (!response.ok) throw errorFromResponse(response.status, json);

      if (parseError !== undefined || !isPlainObject(json) || !isPlainObject(json.flags)) {
        throw new PotatoError(`Potato API returned an unexpected response body (status ${response.status})`, {
          status: response.status,
          error: "invalid_response",
          cause: parseError,
        });
      }
      return new PotatoFlags(json.flags as Record<string, FlagValue>);
    },
  };
}

function errorFromResponse(status: number, json: unknown): PotatoError {
  const body = isPlainObject(json) ? json : {};
  const error = typeof body.error === "string" ? body.error : status === 413 ? "payload_too_large" : "http_error";
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  const serverMessage = typeof body.message === "string" ? body.message : undefined;
  let message = `Potato API responded ${status} ${error}`;
  if (reason) message += ` (${reason})`;
  if (serverMessage) message += `: ${serverMessage}`;
  return new PotatoError(message, { status, error, reason, details: body.details });
}
