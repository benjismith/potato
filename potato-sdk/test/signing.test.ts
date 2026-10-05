import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalString,
  hashBody,
  loadPrivateKey,
  signRequest,
  type SignedHeaders,
} from "../src/index.js";

interface VectorCase {
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

interface Vectors {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  cases: VectorCase[];
}

const vectors = JSON.parse(
  readFileSync(new URL("../../potato-planning/docs/signing-vectors.json", import.meta.url), "utf8"),
) as Vectors;

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNATURE_RE = /^[A-Za-z0-9_-]{86}$/;

function canonicalFromHeaders(h: SignedHeaders, method: string, target: string, body: string): string {
  return buildCanonicalString({
    keyId: h["X-Potato-Key-Id"],
    method,
    target,
    timestamp: h["X-Potato-Timestamp"],
    nonce: h["X-Potato-Nonce"],
    bodySha256: hashBody(body),
  });
}

describe("signing vectors", () => {
  it("has cases", () => {
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  for (const c of vectors.cases) {
    describe(c.name, () => {
      it("reproduces the body SHA-256", () => {
        expect(hashBody(c.body)).toBe(c.bodySha256);
        expect(hashBody(Buffer.from(c.body, "utf8"))).toBe(c.bodySha256);
      });

      it("reproduces the canonical string", () => {
        expect(
          buildCanonicalString({
            keyId: vectors.keyId,
            method: c.method,
            target: c.path,
            timestamp: c.timestamp,
            nonce: c.nonce,
            bodySha256: c.bodySha256,
          }),
        ).toBe(c.canonical);
      });

      it("reproduces the signature", () => {
        const headers = signRequest({
          keyId: vectors.keyId,
          privateKey: vectors.privateKeyPem,
          method: c.method,
          target: c.path,
          body: c.body,
          now: Number(c.timestamp) * 1000 + 999,
          nonce: c.nonce,
        });
        expect(headers).toEqual({
          "X-Potato-Key-Id": vectors.keyId,
          "X-Potato-Timestamp": c.timestamp,
          "X-Potato-Nonce": c.nonce,
          "X-Potato-Signature": c.signature,
        });
      });

      it("produces the same signature from a KeyObject and from bytes", () => {
        const headers = signRequest({
          keyId: vectors.keyId,
          privateKey: createPrivateKey(vectors.privateKeyPem),
          method: c.method,
          target: c.path,
          body: new TextEncoder().encode(c.body),
          now: Number(c.timestamp) * 1000,
          nonce: c.nonce,
        });
        expect(headers["X-Potato-Signature"]).toBe(c.signature);
      });
    });
  }
});

describe("signRequest without injection", () => {
  const sign = () =>
    signRequest({
      keyId: vectors.keyId,
      privateKey: vectors.privateKeyPem,
      method: "POST",
      target: "/sdk/v1/evaluate",
      body: '{"subject":{"key":"alice"}}',
    });

  it("generates a unique, well-formed nonce per call", () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const nonce = sign()["X-Potato-Nonce"];
      expect(nonce).toMatch(NONCE_RE);
      // 16 random bytes, base64url-encoded without padding.
      expect(Buffer.from(nonce, "base64url")).toHaveLength(16);
      nonces.add(nonce);
    }
    expect(nonces.size).toBe(200);
  });

  it("uses the current Unix-seconds timestamp", () => {
    const before = Math.floor(Date.now() / 1000);
    const ts = sign()["X-Potato-Timestamp"];
    const after = Math.floor(Date.now() / 1000);
    expect(ts).toMatch(/^[0-9]+$/);
    expect(Number(ts)).toBeGreaterThanOrEqual(before);
    expect(Number(ts)).toBeLessThanOrEqual(after);
  });

  it("emits an unpadded base64url signature of 86 chars that verifies", () => {
    const headers = sign();
    const signature = headers["X-Potato-Signature"];
    expect(signature).toHaveLength(86);
    expect(signature).toMatch(SIGNATURE_RE);
    expect(signature).not.toContain("=");
    const canonical = canonicalFromHeaders(headers, "POST", "/sdk/v1/evaluate", '{"subject":{"key":"alice"}}');
    expect(
      verify(null, Buffer.from(canonical, "utf8"), createPublicKey(vectors.publicKeyPem), Buffer.from(signature, "base64url")),
    ).toBe(true);
  });

  it("treats an omitted body as empty", () => {
    const headers = signRequest({
      keyId: vectors.keyId,
      privateKey: vectors.privateKeyPem,
      method: "GET",
      target: "/sdk/v1/example?b=2&a=1",
      now: 1767225601_000,
      nonce: "bm9uY2UtMDAwMDAwMDAy",
    });
    expect(headers["X-Potato-Signature"]).toBe(vectors.cases[1]?.signature);
  });
});

describe("key validation", () => {
  const base = {
    keyId: vectors.keyId,
    method: "GET",
    target: "/sdk/v1/example",
  };

  it("rejects an RSA private key (PEM and KeyObject)", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => signRequest({ ...base, privateKey: pem })).toThrow(/Ed25519 private key.*rsa key was given/);
    expect(() => signRequest({ ...base, privateKey })).toThrow(/Ed25519 private key.*rsa key was given/);
  });

  it("rejects an EC private key (PKCS#8 and SEC1 PEM)", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const sec1 = privateKey.export({ type: "sec1", format: "pem" }).toString();
    expect(() => signRequest({ ...base, privateKey: pkcs8 })).toThrow(/Ed25519 private key.*ec key was given/);
    expect(() => signRequest({ ...base, privateKey: sec1 })).toThrow(/Ed25519 private key.*ec key was given/);
  });

  it("rejects an Ed25519 public key (PEM and KeyObject)", () => {
    expect(() => signRequest({ ...base, privateKey: vectors.publicKeyPem })).toThrow(/public key PEM was given/);
    expect(() => signRequest({ ...base, privateKey: createPublicKey(vectors.publicKeyPem) })).toThrow(
      /Ed25519 private key.*public key was given/,
    );
  });

  it("rejects unparseable input", () => {
    expect(() => loadPrivateKey("not a key")).toThrow(/Could not parse Potato signing key/);
  });

  it("accepts the Ed25519 test key", () => {
    expect(loadPrivateKey(vectors.privateKeyPem).asymmetricKeyType).toBe("ed25519");
  });
});

describe("buildCanonicalString validation", () => {
  const good = {
    keyId: vectors.keyId,
    method: "post",
    target: "/sdk/v1/evaluate",
    timestamp: 1767225600,
    nonce: "bm9uY2UtMDAwMDAwMDAx",
    bodySha256: hashBody(""),
  };

  it("uppercases the method and accepts a numeric timestamp", () => {
    expect(buildCanonicalString(good).split("\n").slice(2, 5)).toEqual(["POST", "/sdk/v1/evaluate", "1767225600"]);
  });

  it.each([
    ["keyId", "key_short"],
    ["method", "GE T"],
    ["target", "/sdk/v1/x\nfoo"],
    ["target", "sdk/v1/x"],
    ["timestamp", "1.5"],
    ["timestamp", -1],
    ["nonce", "short"],
    ["nonce", "has+invalid/chars=padding"],
    ["bodySha256", "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"],
  ] as const)("rejects a malformed %s (%j)", (field, value) => {
    expect(() => buildCanonicalString({ ...good, [field]: value })).toThrow(TypeError);
  });
});
