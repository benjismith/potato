import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  KEY_ID_HEADER,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "../../src/sdk-auth/canonical.js";
import { InMemoryNonceStore, type NonceStore } from "../../src/sdk-auth/nonce-store.js";
import {
  verifyRequest,
  type VerifyDeps,
  type VerifyInput,
  type VerifyResult,
} from "../../src/sdk-auth/verify.js";
import {
  freshNonce,
  headersOf,
  lookupFrom,
  msAt,
  signHeaders,
  testKey,
  utf8,
  vectorHeaders,
  vectors,
  type VectorCase,
} from "./support.js";

const evaluateCase = vectors.cases.find((c) => c.name === "evaluate-post")!;
const NOW_TS = "1767225600";

function deps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    now: () => msAt(NOW_TS),
    lookupKey: lookupFrom(testKey),
    nonceStore: new InMemoryNonceStore(),
    ...overrides,
  };
}

function vectorInput(c: VectorCase, overrides: Partial<VerifyInput> = {}): VerifyInput {
  return {
    method: c.method,
    target: c.path,
    headers: headersOf(vectorHeaders(c)),
    body: utf8(c.body),
    ...overrides,
  };
}

/** A freshly signed request at NOW_TS, with a unique nonce. */
function signedInput(
  overrides: { method?: string; target?: string; body?: string; timestamp?: string; nonce?: string } = {},
): VerifyInput {
  const method = overrides.method ?? "POST";
  const target = overrides.target ?? "/sdk/v1/evaluate";
  const body = overrides.body ?? '{"subject":{"key":"bob"}}';
  const headers = signHeaders({
    method,
    target,
    body,
    timestamp: overrides.timestamp ?? NOW_TS,
    nonce: overrides.nonce ?? freshNonce(),
  });
  return { method, target, headers: headersOf(headers), body: utf8(body) };
}

const failure = (reason: string): VerifyResult =>
  ({ ok: false, status: 401, reason }) as VerifyResult;

describe("signing vectors: verification", () => {
  for (const c of vectors.cases) {
    it(`${c.name}: signature verifies with an injected clock`, async () => {
      const result = await verifyRequest(vectorInput(c), deps({ now: () => msAt(c.timestamp) }));
      expect(result).toEqual({ ok: true, key: testKey });
    });
  }

  describe("altering any single field fails with bad_signature", () => {
    for (const c of vectors.cases) {
      const now = () => msAt(c.timestamp);
      const otherMethod = c.method === "POST" ? "PUT" : "POST";

      it(`${c.name}: method`, async () => {
        const result = await verifyRequest(vectorInput(c, { method: otherMethod }), deps({ now }));
        expect(result).toEqual(failure("bad_signature"));
      });

      it(`${c.name}: target`, async () => {
        for (const target of [`${c.path}x`, c.path.replace("/sdk/", "/SDK/"), `${c.path}?`]) {
          const result = await verifyRequest(vectorInput(c, { target }), deps({ now }));
          expect(result, target).toEqual(failure("bad_signature"));
        }
      });

      it(`${c.name}: timestamp`, async () => {
        const headers = headersOf({
          ...vectorHeaders(c),
          [TIMESTAMP_HEADER]: String(Number(c.timestamp) + 1),
        });
        const result = await verifyRequest(vectorInput(c, { headers }), deps({ now }));
        expect(result).toEqual(failure("bad_signature"));
      });

      it(`${c.name}: nonce`, async () => {
        const nonce = c.nonce.slice(0, -1) + (c.nonce.endsWith("A") ? "B" : "A");
        const headers = headersOf({ ...vectorHeaders(c), [NONCE_HEADER]: nonce });
        const result = await verifyRequest(vectorInput(c, { headers }), deps({ now }));
        expect(result).toEqual(failure("bad_signature"));
      });

      it(`${c.name}: one body byte`, async () => {
        const original = utf8(c.body);
        // An empty body can only be altered by adding a byte.
        const positions = original.length === 0 ? [] : [0, original.length >> 1, original.length - 1];
        for (const i of positions) {
          const body = original.slice();
          body[i] = body[i]! ^ 0x01;
          const result = await verifyRequest(vectorInput(c, { body }), deps({ now }));
          expect(result, `byte ${i}`).toEqual(failure("bad_signature"));
        }
        const extended = new Uint8Array(original.length + 1);
        extended.set(original);
        const result = await verifyRequest(vectorInput(c, { body: extended }), deps({ now }));
        expect(result).toEqual(failure("bad_signature"));
      });

      it(`${c.name}: signature`, async () => {
        const bytes = Buffer.from(c.signature, "base64url");
        bytes[0] = bytes[0]! ^ 0x01;
        const headers = headersOf({ ...vectorHeaders(c), [SIGNATURE_HEADER]: bytes.toString("base64url") });
        const result = await verifyRequest(vectorInput(c, { headers }), deps({ now }));
        expect(result).toEqual(failure("bad_signature"));
      });
    }
  });
});

describe("verifyRequest", () => {
  it("uppercases the received method", async () => {
    const result = await verifyRequest(
      vectorInput(evaluateCase, { method: "post" }),
      deps({ now: () => msAt(evaluateCase.timestamp) }),
    );
    expect(result.ok).toBe(true);
  });

  describe("missing_or_malformed_headers", () => {
    const valid = () => vectorHeaders(evaluateCase);

    it.each([KEY_ID_HEADER, TIMESTAMP_HEADER, NONCE_HEADER, SIGNATURE_HEADER])(
      "when %s is missing",
      async (name) => {
        const headers = valid();
        delete headers[name];
        const result = await verifyRequest(vectorInput(evaluateCase, { headers: headersOf(headers) }), deps());
        expect(result).toEqual(failure("missing_or_malformed_headers"));
      },
    );

    const sig = evaluateCase.signature;
    it.each([
      [KEY_ID_HEADER, "key_01jzztestkey00000000000000"], // lowercase
      [KEY_ID_HEADER, "key_01JZZTESTKEY0000000000000"], // 25 chars
      [KEY_ID_HEADER, "key_01JZZTESTKEY0000000000000I"], // I isn't Crockford
      [KEY_ID_HEADER, "env_01JZZTESTKEY00000000000000"],
      [TIMESTAMP_HEADER, "01767225600"], // leading zero
      [TIMESTAMP_HEADER, "+1767225600"],
      [TIMESTAMP_HEADER, "1767225600.5"],
      [TIMESTAMP_HEADER, "1767225600000x"],
      [TIMESTAMP_HEADER, ""],
      [NONCE_HEADER, "a".repeat(15)],
      [NONCE_HEADER, "a".repeat(65)],
      [NONCE_HEADER, "bm9uY2UtMDAwMDAwMDAx="], // padding
      [NONCE_HEADER, "bm9uY2UtMDAwMDAw+/Ax"], // standard base64 alphabet
      [SIGNATURE_HEADER, `${sig}==`], // padded
      [SIGNATURE_HEADER, sig.slice(0, -1)], // 85 chars
      [SIGNATURE_HEADER, sig.replace(/-/g, "+").replace(/_/g, "/")], // standard alphabet
      [SIGNATURE_HEADER, `${sig.slice(0, -1)}B`], // non-canonical final char
    ])("when %s is %j", async (name, value) => {
      const headers = headersOf({ ...valid(), [name]: value });
      const result = await verifyRequest(vectorInput(evaluateCase, { headers }), deps({ now: () => msAt(evaluateCase.timestamp) }));
      expect(result).toEqual(failure("missing_or_malformed_headers"));
    });

    it("rejects a duplicated header (joined with a comma)", async () => {
      const headers = headersOf(valid());
      headers.append(NONCE_HEADER, evaluateCase.nonce);
      const result = await verifyRequest(vectorInput(evaluateCase, { headers }), deps());
      expect(result).toEqual(failure("missing_or_malformed_headers"));
    });

    it("is checked before the key lookup", async () => {
      const lookupKey = vi.fn(lookupFrom(testKey));
      const result = await verifyRequest(
        vectorInput(evaluateCase, { headers: headersOf({}) }),
        deps({ lookupKey }),
      );
      expect(result).toEqual(failure("missing_or_malformed_headers"));
      expect(lookupKey).not.toHaveBeenCalled();
    });
  });

  describe("stale_timestamp", () => {
    const at = (offsetSeconds: number) => () => msAt(Number(NOW_TS) + offsetSeconds);

    it("accepts timestamps exactly 300 s away, either direction", async () => {
      expect((await verifyRequest(signedInput(), deps({ now: at(300) }))).ok).toBe(true);
      expect((await verifyRequest(signedInput(), deps({ now: at(-300) }))).ok).toBe(true);
      // Sub-second clock positions within the 300th second still pass.
      expect((await verifyRequest(signedInput(), deps({ now: () => msAt(NOW_TS) + 300_999 }))).ok).toBe(true);
    });

    it("rejects timestamps 301 s away, either direction, before looking up the key", async () => {
      const lookupKey = vi.fn(lookupFrom(testKey));
      expect(await verifyRequest(signedInput(), deps({ now: at(301), lookupKey }))).toEqual(failure("stale_timestamp"));
      expect(await verifyRequest(signedInput(), deps({ now: at(-301), lookupKey }))).toEqual(failure("stale_timestamp"));
      expect(lookupKey).not.toHaveBeenCalled();
    });

    it("rejects an absurdly large timestamp", async () => {
      const headers = headersOf({ ...vectorHeaders(evaluateCase), [TIMESTAMP_HEADER]: "9".repeat(400) });
      const result = await verifyRequest(vectorInput(evaluateCase, { headers }), deps());
      expect(result).toEqual(failure("stale_timestamp"));
    });

    it("rejects the vectors against the real clock", async () => {
      const result = await verifyRequest(vectorInput(evaluateCase), deps({ now: Date.now }));
      expect(result).toEqual(failure("stale_timestamp"));
    });
  });

  describe("unknown_key", () => {
    it("when the lookup returns null (unknown or revoked)", async () => {
      const result = await verifyRequest(
        vectorInput(evaluateCase),
        deps({ now: () => msAt(evaluateCase.timestamp), lookupKey: async () => null }),
      );
      expect(result).toEqual(failure("unknown_key"));
    });
  });

  describe("bad_signature", () => {
    it("when signed by a different private key", async () => {
      const other = generateKeyPairSync("ed25519");
      const body = "{}";
      const headers = signHeaders({
        method: "POST",
        target: "/sdk/v1/evaluate",
        body,
        timestamp: NOW_TS,
        nonce: freshNonce(),
        privateKeyPem: other.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      });
      const result = await verifyRequest(
        { method: "POST", target: "/sdk/v1/evaluate", headers: headersOf(headers), body: utf8(body) },
        deps(),
      );
      expect(result).toEqual(failure("bad_signature"));
    });

    it("when the target can't be a signed target", async () => {
      const result = await verifyRequest(signedInput({ target: "/sdk/v1/evaluate" }), deps());
      expect(result.ok).toBe(true);
      const input = signedInput();
      const bad = await verifyRequest({ ...input, target: "*" }, deps());
      expect(bad).toEqual(failure("bad_signature"));
    });

    it("throws (a server fault) if the stored key isn't an Ed25519 public key", async () => {
      const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const lookupKey = lookupFrom({ ...testKey, publicKey: rsa.publicKey });
      await expect(verifyRequest(signedInput(), deps({ lookupKey }))).rejects.toThrow(/not an Ed25519 public key/);
    });
  });

  describe("replayed_nonce", () => {
    it("rejects the same (key, nonce) a second time", async () => {
      const d = deps({ now: () => msAt(evaluateCase.timestamp) });
      expect((await verifyRequest(vectorInput(evaluateCase), d)).ok).toBe(true);
      expect(await verifyRequest(vectorInput(evaluateCase), d)).toEqual(failure("replayed_nonce"));
    });

    it("rejects a replay even with a fresh signature over a new timestamp", async () => {
      const d = deps();
      const nonce = freshNonce();
      expect((await verifyRequest(signedInput({ nonce }), d)).ok).toBe(true);
      const later = String(Number(NOW_TS) + 1);
      const d2 = { ...d, now: () => msAt(later) };
      expect(await verifyRequest(signedInput({ nonce, timestamp: later }), d2)).toEqual(failure("replayed_nonce"));
    });

    it("scopes nonces per key", async () => {
      const store = new InMemoryNonceStore();
      expect(store.checkAndRecord("key_A", "n", 0)).toBe(true);
      expect(store.checkAndRecord("key_B", "n", 0)).toBe(true);
      expect(store.checkAndRecord("key_A", "n", 0)).toBe(false);
    });
  });

  describe("nonce recording", () => {
    it("a bad signature does not consume the nonce", async () => {
      const d = deps({ now: () => msAt(evaluateCase.timestamp) });
      const tampered = vectorInput(evaluateCase, { body: utf8(`${evaluateCase.body} `) });
      expect(await verifyRequest(tampered, d)).toEqual(failure("bad_signature"));
      // The genuine request with the same nonce still succeeds.
      expect(await verifyRequest(vectorInput(evaluateCase), d)).toEqual({ ok: true, key: testKey });
    });

    it("the nonce store is not touched before the signature verifies", async () => {
      const checkAndRecord = vi.fn<NonceStore["checkAndRecord"]>(() => true);
      const nonceStore: NonceStore = { checkAndRecord };
      const now = () => msAt(evaluateCase.timestamp);

      await verifyRequest(vectorInput(evaluateCase, { headers: headersOf({}) }), deps({ now, nonceStore }));
      await verifyRequest(vectorInput(evaluateCase), deps({ now: Date.now, nonceStore }));
      await verifyRequest(vectorInput(evaluateCase), deps({ now, nonceStore, lookupKey: async () => null }));
      await verifyRequest(vectorInput(evaluateCase, { method: "PUT" }), deps({ now, nonceStore }));
      expect(checkAndRecord).not.toHaveBeenCalled();

      await verifyRequest(vectorInput(evaluateCase), deps({ now, nonceStore }));
      expect(checkAndRecord).toHaveBeenCalledExactlyOnceWith(vectors.keyId, evaluateCase.nonce, msAt(evaluateCase.timestamp));
    });

    it("awaits an async nonce store", async () => {
      const nonceStore: NonceStore = { checkAndRecord: async () => false };
      const result = await verifyRequest(signedInput(), deps({ nonceStore }));
      expect(result).toEqual(failure("replayed_nonce"));
    });
  });
});
