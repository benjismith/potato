import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildCanonicalString,
  createPotatoClient,
  hashBody,
  PotatoError,
  PotatoFlags,
  type PotatoClientOptions,
} from "../src/index.js";

interface Vectors {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
}

const vectors = JSON.parse(
  readFileSync(new URL("../../potato-planning/docs/signing-vectors.json", import.meta.url), "utf8"),
) as Vectors;

const KEY_ID = vectors.keyId;
const publicKey = createPublicKey(vectors.publicKeyPem);

interface Captured {
  url: string;
  init: RequestInit;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A stub fetch that records each call and answers with `respond()`. */
function stubFetch(respond: () => Response | Promise<Response> = () => jsonResponse(200, { flags: {} })) {
  const calls: Captured[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function client(overrides: Partial<PotatoClientOptions> = {}) {
  return createPotatoClient({
    apiUrl: "https://potato.example.com",
    keyId: KEY_ID,
    privateKey: vectors.privateKeyPem,
    ...overrides,
  });
}

function headersOf(call: Captured): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

/** Verifies the request's signature the way the API would, from what was sent. */
function verifySent(call: Captured, key = publicKey): boolean {
  const h = headersOf(call);
  const url = new URL(call.url);
  const canonical = buildCanonicalString({
    keyId: h["X-Potato-Key-Id"]!,
    method: call.init.method!,
    target: url.pathname + url.search,
    timestamp: h["X-Potato-Timestamp"]!,
    nonce: h["X-Potato-Nonce"]!,
    bodySha256: hashBody(call.init.body as string),
  });
  return verify(null, Buffer.from(canonical, "utf8"), key, Buffer.from(h["X-Potato-Signature"]!, "base64url"));
}

async function catchError(promise: Promise<unknown>): Promise<PotatoError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(PotatoError);
    return err as PotatoError;
  }
  throw new Error("expected a rejection");
}

describe("createPotatoClient config validation", () => {
  it("rejects a malformed key ID", () => {
    expect(() => client({ keyId: "key_123" })).toThrow(TypeError);
    expect(() => client({ keyId: "key_01jzztestkey00000000000000" })).toThrow(/keyId/);
  });

  it("rejects a public key or garbage as the private key", () => {
    expect(() => client({ privateKey: vectors.publicKeyPem })).toThrow(/public key/);
    expect(() => client({ privateKey: "nope" })).toThrow(TypeError);
  });

  it("accepts a KeyObject private key", () => {
    expect(() => client({ privateKey: createPrivateKey(vectors.privateKeyPem) })).not.toThrow();
  });

  it("rejects bad apiUrls", () => {
    for (const apiUrl of [
      "",
      "potato.example.com",
      "ftp://potato.example.com",
      "https://u:p@potato.example.com",
      "https://potato.example.com/?x=1",
      "https://potato.example.com/#frag",
      "https://potato.example.com?",
    ]) {
      expect(() => client({ apiUrl }), apiUrl).toThrow(TypeError);
    }
  });

  it("rejects bad timeouts and a non-function fetch", () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => client({ timeoutMs })).toThrow(/timeoutMs/);
    }
    expect(() => client({ fetch: "x" as unknown as typeof fetch })).toThrow(/fetch/);
  });
});

describe("evaluate request", () => {
  it("POSTs the exact signed body to /sdk/v1/evaluate with valid signature headers", async () => {
    const { fetch, calls } = stubFetch();
    const subject = { key: "alice", attributes: { plan: "pro", seats: 3 } };
    const before = Math.floor(Date.now() / 1000);
    await client({ fetch }).evaluate(subject);
    const after = Math.floor(Date.now() / 1000);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://potato.example.com/sdk/v1/evaluate");
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe('{"subject":{"key":"alice","attributes":{"plan":"pro","seats":3}}}');

    const h = headersOf(call);
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-Potato-Key-Id"]).toBe(KEY_ID);
    const ts = Number(h["X-Potato-Timestamp"]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(h["X-Potato-Nonce"]).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(h["X-Potato-Signature"]).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(verifySent(call)).toBe(true);
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits attributes when not given", async () => {
    const { fetch, calls } = stubFetch();
    await client({ fetch }).evaluate({ key: "bob" });
    expect(calls[0]!.init.body).toBe('{"subject":{"key":"bob"}}');
    expect(verifySent(calls[0]!)).toBe(true);
  });

  it("signs non-ASCII bodies over their UTF-8 bytes", async () => {
    const { fetch, calls } = stubFetch();
    await client({ fetch }).evaluate({ key: "zoë", attributes: { city: "北京" } });
    expect(verifySent(calls[0]!)).toBe(true);
  });

  it("fails verification against a different public key or a tampered body", async () => {
    const { fetch, calls } = stubFetch();
    await client({ fetch }).evaluate({ key: "alice" });
    const other = generateKeyPairSync("ed25519").publicKey;
    expect(verifySent(calls[0]!, other)).toBe(false);
    const tampered = { ...calls[0]!, init: { ...calls[0]!.init, body: '{"subject":{"key":"mallory"}}' } };
    expect(verifySent(tampered)).toBe(false);
  });

  it("uses a fresh nonce on every call", async () => {
    const { fetch, calls } = stubFetch();
    const c = client({ fetch });
    await c.evaluate({ key: "alice" });
    await c.evaluate({ key: "alice" });
    expect(headersOf(calls[0]!)["X-Potato-Nonce"]).not.toBe(headersOf(calls[1]!)["X-Potato-Nonce"]);
  });

  it("strips trailing slashes from apiUrl", async () => {
    const { fetch, calls } = stubFetch();
    await client({ fetch, apiUrl: "https://potato.example.com:8443///" }).evaluate({ key: "a" });
    expect(calls[0]!.url).toBe("https://potato.example.com:8443/sdk/v1/evaluate");
    expect(verifySent(calls[0]!)).toBe(true);
  });

  it("includes an apiUrl base path in the URL and the signed target", async () => {
    const { fetch, calls } = stubFetch();
    await client({ fetch, apiUrl: "https://x.com/potato/" }).evaluate({ key: "a" });
    expect(calls[0]!.url).toBe("https://x.com/potato/sdk/v1/evaluate");
    expect(verifySent(calls[0]!)).toBe(true);

    // Prove the base path really is in the signed target: verifying as if the
    // proxy had stripped it fails.
    const stripped = { ...calls[0]!, url: "https://x.com/sdk/v1/evaluate" };
    expect(verifySent(stripped)).toBe(false);
  });

  it("signs the percent-encoded base path exactly as sent", async () => {
    const { fetch, calls } = stubFetch();
    await client({ fetch, apiUrl: "https://x.com/my potato" }).evaluate({ key: "a" });
    expect(calls[0]!.url).toBe("https://x.com/my%20potato/sdk/v1/evaluate");
    expect(verifySent(calls[0]!)).toBe(true);
  });

  it("uses globalThis.fetch when no fetch option is given", async () => {
    const { fetch, calls } = stubFetch();
    vi.stubGlobal("fetch", fetch);
    try {
      await client().evaluate({ key: "a" });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls).toHaveLength(1);
  });

  it("rejects invalid subjects before calling fetch", async () => {
    const { fetch, calls } = stubFetch();
    const c = client({ fetch });
    for (const subject of [
      null,
      "alice",
      {},
      { key: "" },
      { key: 7 },
      { key: "x".repeat(256) },
      { key: "a", attributes: [] },
      { key: "a", attributes: "pro" },
    ]) {
      await expect(c.evaluate(subject as never), JSON.stringify(subject)).rejects.toThrow(TypeError);
    }
    await expect(c.evaluate({ key: "x".repeat(255) })).resolves.toBeInstanceOf(PotatoFlags);
    expect(calls).toHaveLength(1);
  });
});

describe("evaluate responses", () => {
  it("returns the flags", async () => {
    const { fetch } = stubFetch(() =>
      jsonResponse(200, { flags: { "new-checkout": true, "banner-color": "blue", limits: { max: 3 } } }),
    );
    const flags = await client({ fetch }).evaluate({ key: "alice" });
    expect(flags.get("new-checkout", false)).toBe(true);
    expect(flags.get("banner-color", "green")).toBe("blue");
    expect(flags.get("limits", { max: 1 })).toEqual({ max: 3 });
    expect(flags.toJSON()).toEqual({ "new-checkout": true, "banner-color": "blue", limits: { max: 3 } });
  });

  it("surfaces a 401's reason on PotatoError", async () => {
    const { fetch } = stubFetch(() => jsonResponse(401, { error: "unauthorized", reason: "stale_timestamp" }));
    const err = await catchError(client({ fetch }).evaluate({ key: "alice" }));
    expect(err.status).toBe(401);
    expect(err.error).toBe("unauthorized");
    expect(err.reason).toBe("stale_timestamp");
    expect(err.message).toContain("stale_timestamp");
    expect(err.name).toBe("PotatoError");
  });

  it("surfaces a 400's error, message, and details", async () => {
    const details = [{ path: "subject.key", message: "required" }];
    const { fetch } = stubFetch(() =>
      jsonResponse(400, { error: "validation_error", message: "Invalid body", details }),
    );
    const err = await catchError(client({ fetch }).evaluate({ key: "alice" }));
    expect(err.status).toBe(400);
    expect(err.error).toBe("validation_error");
    expect(err.reason).toBeUndefined();
    expect(err.details).toEqual(details);
    expect(err.message).toContain("Invalid body");
  });

  it("handles non-JSON error bodies", async () => {
    const { fetch } = stubFetch(() => new Response("Payload Too Large", { status: 413 }));
    const tooLarge = await catchError(client({ fetch }).evaluate({ key: "alice" }));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.error).toBe("payload_too_large");

    const { fetch: fetch502 } = stubFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const bad = await catchError(client({ fetch: fetch502 }).evaluate({ key: "alice" }));
    expect(bad.status).toBe(502);
    expect(bad.error).toBe("http_error");
  });

  it("rejects malformed success bodies", async () => {
    for (const body of ["not json", "[]", '{"flags":[]}', '{"nope":{}}', "null"]) {
      const { fetch } = stubFetch(() => new Response(body, { status: 200 }));
      const err = await catchError(client({ fetch }).evaluate({ key: "alice" }));
      expect(err.status, body).toBe(200);
      expect(err.error, body).toBe("invalid_response");
    }
  });

  it("wraps network errors", async () => {
    const cause = new TypeError("fetch failed");
    const fetch = (async () => {
      throw cause;
    }) as typeof globalThis.fetch;
    const err = await catchError(client({ fetch }).evaluate({ key: "alice" }));
    expect(err.status).toBeNull();
    expect(err.error).toBe("network_error");
    expect(err.cause).toBe(cause);
  });

  it("wraps timeouts", async () => {
    // Never answers until the abort signal fires, like a hung server.
    const fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof globalThis.fetch;
    const started = Date.now();
    const err = await catchError(client({ fetch, timeoutMs: 30 }).evaluate({ key: "alice" }));
    expect(err.status).toBeNull();
    expect(err.error).toBe("timeout");
    expect(err.message).toContain("30 ms");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("PotatoFlags", () => {
  const flags = new PotatoFlags({ on: true, color: "blue", count: 3, list: [1], obj: { a: 1 }, nil: null });

  it("returns the fallback for unknown keys", () => {
    expect(flags.get("missing", false)).toBe(false);
    expect(flags.get("missing", "green")).toBe("green");
    expect(flags.has("missing")).toBe(false);
  });

  it("returns the fallback when the value's type doesn't match", () => {
    expect(flags.get("color", false)).toBe(false);
    expect(flags.get("on", "x")).toBe("x");
    expect(flags.get("list", { a: 0 })).toEqual({ a: 0 });
    expect(flags.get("obj", [] as number[])).toEqual([]);
    expect(flags.get("nil", 5)).toBe(5);
  });

  it("returns matching values, and anything for a null fallback", () => {
    expect(flags.get("count", 0)).toBe(3);
    expect(flags.get("list", [] as number[])).toEqual([1]);
    expect(flags.get("color", null)).toBe("blue");
    expect(flags.get("nil", null)).toBeNull();
  });

  it("lists keys and serializes to the raw map", () => {
    expect(flags.keys()).toEqual(["on", "color", "count", "list", "obj", "nil"]);
    expect(JSON.parse(JSON.stringify(flags))).toEqual(flags.toJSON());
    expect(flags.has("nil")).toBe(true);
  });
});
