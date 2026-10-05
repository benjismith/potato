import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  defaultRequestTarget,
  MAX_BODY_BYTES,
  sdkAuth,
  type SdkAuthEnv,
  type SdkAuthOptions,
} from "../../src/sdk-auth/middleware.js";
import { InMemoryNonceStore } from "../../src/sdk-auth/nonce-store.js";
import {
  ENV_ID,
  freshNonce,
  lookupFrom,
  msAt,
  signHeaders,
  testKey,
  vectorHeaders,
  vectors,
} from "./support.js";

const NOW_TS = "1767225600";
const evaluateCase = vectors.cases.find((c) => c.name === "evaluate-post")!;

/** A throwaway app with sdkAuth on /sdk/v1/*, echoing what handlers can see. */
function makeApp(overrides: Partial<SdkAuthOptions> = {}) {
  const app = new Hono<SdkAuthEnv>();
  app.use(
    "/sdk/v1/*",
    sdkAuth({
      now: () => msAt(NOW_TS),
      lookupKey: lookupFrom(testKey),
      nonceStore: new InMemoryNonceStore(),
      ...overrides,
    }),
  );
  app.post("/sdk/v1/evaluate", async (c) => {
    const json: unknown = await c.req.json();
    return c.json({
      keyId: c.get("sdkKey").id,
      environmentId: c.get("environmentId"),
      rawBody: new TextDecoder().decode(c.get("rawBody")),
      json,
    });
  });
  app.post("/sdk/v1/text", async (c) => c.json({ text: await c.req.text(), size: c.get("rawBody").byteLength }));
  app.get("/sdk/v1/example", (c) => c.json({ size: c.get("rawBody").byteLength, env: c.get("environmentId") }));
  return app;
}

function signed(method: string, target: string, body: string | Uint8Array = "", nonce = freshNonce()) {
  return signHeaders({ method, target, body, timestamp: NOW_TS, nonce });
}

describe("sdkAuth middleware", () => {
  it("verifies a signed request and exposes the key, environment, and raw body", async () => {
    const app = makeApp();
    const res = await app.request(evaluateCase.path, {
      method: "POST",
      headers: { ...vectorHeaders(evaluateCase), "Content-Type": "application/json" },
      body: evaluateCase.body,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      keyId: vectors.keyId,
      environmentId: ENV_ID,
      rawBody: evaluateCase.body,
      json: JSON.parse(evaluateCase.body),
    });
  });

  it("verifies every vector end to end", async () => {
    for (const c of vectors.cases) {
      const app = new Hono<SdkAuthEnv>();
      app.use(sdkAuth({ now: () => msAt(c.timestamp), lookupKey: lookupFrom(testKey), nonceStore: new InMemoryNonceStore() }));
      app.all("*", (c) => c.text(new TextDecoder().decode(c.get("rawBody"))));
      const res = await app.request(c.path, {
        method: c.method,
        headers: vectorHeaders(c),
        ...(c.body !== "" && { body: c.body }),
      });
      expect(res.status, c.name).toBe(200);
      expect(await res.text(), c.name).toBe(c.body);
    }
  });

  it("verifies a GET with a query string and no body", async () => {
    const target = "/sdk/v1/example?b=2&a=1";
    const res = await makeApp().request(target, { headers: signed("GET", target) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ size: 0, env: ENV_ID });
  });

  it("responds 401 with the reason, and doesn't call the handler", async () => {
    const app = makeApp();
    const res = await app.request("/sdk/v1/evaluate", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "unauthorized",
      reason: "missing_or_malformed_headers",
      message: expect.any(String),
    });
  });

  it.each([
    ["stale_timestamp", { now: () => msAt(NOW_TS) + 301_000 }],
    ["unknown_key", { lookupKey: async () => null }],
  ] as const)("responds 401 %s", async (reason, overrides) => {
    const res = await makeApp(overrides).request("/sdk/v1/evaluate", {
      method: "POST",
      headers: signed("POST", "/sdk/v1/evaluate", "{}"),
      body: "{}",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized", reason });
  });

  it("responds 401 bad_signature when the body differs from what was signed", async () => {
    const res = await makeApp().request("/sdk/v1/evaluate", {
      method: "POST",
      headers: signed("POST", "/sdk/v1/evaluate", "{}"),
      body: "{ }",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: "bad_signature" });
  });

  it("responds 401 replayed_nonce on a replay", async () => {
    const app = makeApp();
    const headers = signed("POST", "/sdk/v1/text", "x");
    expect((await app.request("/sdk/v1/text", { method: "POST", headers, body: "x" })).status).toBe(200);
    const res = await app.request("/sdk/v1/text", { method: "POST", headers, body: "x" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: "replayed_nonce" });
  });

  describe("body cap", () => {
    it("accepts a body of exactly 64 KiB", async () => {
      const body = "a".repeat(MAX_BODY_BYTES);
      const res = await makeApp().request("/sdk/v1/text", {
        method: "POST",
        headers: signed("POST", "/sdk/v1/text", body),
        body,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ text: body, size: MAX_BODY_BYTES });
    });

    it("responds 413 to a body over 64 KiB, even when correctly signed", async () => {
      const body = "a".repeat(MAX_BODY_BYTES + 1);
      const res = await makeApp().request("/sdk/v1/text", {
        method: "POST",
        headers: signed("POST", "/sdk/v1/text", body),
        body,
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    });

    it("responds 413 from Content-Length alone, without reading the body", async () => {
      const lookupKey = vi.fn(lookupFrom(testKey));
      const res = await makeApp({ lookupKey }).request("/sdk/v1/text", {
        method: "POST",
        headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
        body: "small",
      });
      expect(res.status).toBe(413);
      expect(lookupKey).not.toHaveBeenCalled();
    });

    it("responds 413 to an oversized streamed body with no Content-Length, without reading it all", async () => {
      const chunk = new Uint8Array(16 * 1024).fill(97);
      let pulled = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          if (pulled > 1000) controller.close();
          else controller.enqueue(chunk);
        },
      });
      const request = new Request("http://localhost/sdk/v1/text", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit);
      expect(request.headers.get("content-length")).toBeNull();
      const res = await makeApp().request(request);
      expect(res.status).toBe(413);
      expect(pulled).toBeLessThan(10);
    });
  });

  describe("markKeyUsed", () => {
    it("is called with the key ID after a successful verification only", async () => {
      const markKeyUsed = vi.fn(async (_keyId: string) => {});
      const app = makeApp({ markKeyUsed });
      await app.request("/sdk/v1/text", { method: "POST", body: "x" });
      expect(markKeyUsed).not.toHaveBeenCalled();
      const res = await app.request("/sdk/v1/text", {
        method: "POST",
        headers: signed("POST", "/sdk/v1/text", "x"),
        body: "x",
      });
      expect(res.status).toBe(200);
      expect(markKeyUsed).toHaveBeenCalledExactlyOnceWith(vectors.keyId);
    });

    it("a failure is logged and doesn't fail the request", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const app = makeApp({ markKeyUsed: async () => Promise.reject(new Error("db down")) });
        const res = await app.request("/sdk/v1/text", {
          method: "POST",
          headers: signed("POST", "/sdk/v1/text", "x"),
          body: "x",
        });
        expect(res.status).toBe(200);
        await vi.waitFor(() => expect(error).toHaveBeenCalled());
      } finally {
        error.mockRestore();
      }
    });
  });

  describe("request target", () => {
    it("prefers the raw request line from @hono/node-server's env.incoming", async () => {
      // The raw target as a client sent it; WHATWG URL parsing would resolve
      // the dot segment, so c.req.url no longer matches what was signed.
      const raw = "/sdk/v1/x/../text?q=%7e";
      const app = makeApp();
      const res = await app.request(
        "/sdk/v1/text?q=%7e",
        { method: "POST", headers: signed("POST", raw, "x"), body: "x" },
        { incoming: { url: raw } },
      );
      expect(res.status).toBe(200);
    });

    it("falls back to the parsed URL's path and query", async () => {
      const app = new Hono();
      app.get("*", (c) => c.text(defaultRequestTarget(c)));
      expect(await (await app.request("/sdk/v1/example?b=2&a=1")).text()).toBe("/sdk/v1/example?b=2&a=1");
      expect(await (await app.request("/sdk/v1/example")).text()).toBe("/sdk/v1/example");
    });
  });
});
