// Hono middleware that authenticates SDK API requests (SIGNING.md). It's a
// thin wrapper: body reading and request-target extraction live here, and
// every check lives in verifyRequest().
import type { Context, MiddlewareHandler } from "hono";
import type { MarkKeyUsed } from "./keys.js";
import type { NonceStore } from "./nonce-store.js";
import {
  verifyRequest,
  type LookupKey,
  type SdkKey,
  type VerifyFailureReason,
} from "./verify.js";

/** The request body cap from SIGNING.md: 64 KiB. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Context variables set by `sdkAuth` for downstream handlers. */
export interface SdkAuthVariables {
  /** The verified signing key. */
  sdkKey: SdkKey;
  /** The key's environment: the only environment this request may read. */
  environmentId: string;
  /** The raw request body bytes: exactly the bytes that were hashed and verified. */
  rawBody: Uint8Array;
}

/** A Hono `Env` for routes mounted behind `sdkAuth`. */
export interface SdkAuthEnv {
  Variables: SdkAuthVariables;
}

/** The JSON body of a `401` from `sdkAuth`. */
export interface SdkUnauthorizedBody {
  error: "unauthorized";
  reason: VerifyFailureReason;
  message: string;
}

export interface SdkAuthOptions {
  lookupKey: LookupKey;
  nonceStore: NonceStore;
  /** Current time in epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Called (without being awaited) after each successful verification.
   * Errors are logged and otherwise ignored, so they never fail the request.
   */
  markKeyUsed?: MarkKeyUsed;
  /** Body cap in bytes. Defaults to 64 KiB. */
  maxBodyBytes?: number;
  /**
   * Returns the request target (path + `?query`) exactly as on the request
   * line. Defaults to `defaultRequestTarget`.
   */
  getTarget?: (c: Context) => string;
}

const reasonMessages: Record<VerifyFailureReason, string> = {
  missing_or_malformed_headers: "The X-Potato-* signing headers are missing or malformed",
  stale_timestamp: "X-Potato-Timestamp is more than 300 seconds from the server's clock",
  unknown_key: "X-Potato-Key-Id does not name an active signing key",
  bad_signature: "X-Potato-Signature does not verify",
  replayed_nonce: "X-Potato-Nonce was already used",
};

/**
 * Returns the request target exactly as it appeared on the HTTP request line.
 *
 * Under `@hono/node-server`, that's `c.env.incoming.url`. `c.req.url` isn't
 * used there, because it's been through WHATWG URL parsing, which can resolve
 * dot segments and percent-encode some characters. Elsewhere (e.g. tests
 * calling `app.request()`), it falls back to the parsed URL's path and query.
 */
export function defaultRequestTarget(c: Context): string {
  const incoming = (c.env as { incoming?: { url?: unknown } } | undefined)?.incoming;
  if (typeof incoming?.url === "string" && incoming.url.startsWith("/")) return incoming.url;
  const url = new URL(c.req.url);
  return url.pathname + url.search;
}

/**
 * Authenticates SDK requests per SIGNING.md. Reads the body once (up to
 * 64 KiB; `413` beyond), verifies the signature, and either responds `401`
 * with `{ error: "unauthorized", reason, message }` or sets `sdkKey`,
 * `environmentId`, and `rawBody` and calls the next handler.
 *
 * The body is also left readable through `c.req.json()`, `c.req.text()`, etc.
 */
export function sdkAuth(options: SdkAuthOptions): MiddlewareHandler<SdkAuthEnv> {
  const now = options.now ?? Date.now;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const getTarget = options.getTarget ?? defaultRequestTarget;

  return async (c, next) => {
    const body = await readBodyCapped(c.req.raw, maxBodyBytes);
    if (body === null) {
      return c.json(
        {
          error: "payload_too_large",
          message: `Request body exceeds ${maxBodyBytes} bytes`,
        },
        413,
      );
    }

    const result = await verifyRequest(
      { method: c.req.method, target: getTarget(c), headers: c.req.raw.headers, body },
      { now, lookupKey: options.lookupKey, nonceStore: options.nonceStore },
    );
    if (!result.ok) {
      const payload: SdkUnauthorizedBody = {
        error: "unauthorized",
        reason: result.reason,
        message: reasonMessages[result.reason],
      };
      return c.json(payload, 401);
    }

    if (options.markKeyUsed) {
      const keyId = result.key.id;
      options.markKeyUsed(keyId).catch((err: unknown) => {
        console.error(`Failed to update last_used_at for ${keyId}`, err);
      });
    }

    c.set("sdkKey", result.key);
    c.set("environmentId", result.key.environmentId);
    c.set("rawBody", body);
    // The raw stream is consumed. Prime Hono's body cache with the same bytes
    // so c.req.json() / text() / validators read exactly what was verified.
    // (Hono's BodyCache type says ArrayBuffer, but at runtime it holds the
    // promise; test/sdk-auth/middleware.test.ts pins this behavior.)
    c.req.bodyCache.arrayBuffer = Promise.resolve(toArrayBuffer(body)) as unknown as ArrayBuffer;
    await next();
  };
}

/**
 * Reads the whole request body, or returns `null` as soon as it's known to
 * exceed `maxBytes` (from `Content-Length`, or while streaming).
 */
async function readBodyCapped(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
