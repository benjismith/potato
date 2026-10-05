import { describe, expect, it } from "vitest";
import { buildCanonicalString, hashBody, SIGNATURE_RE } from "../../src/sdk-auth/canonical.js";
import { vectors } from "./support.js";

describe("signing vectors: canonical string", () => {
  it("has cases to check", () => {
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  for (const c of vectors.cases) {
    it(`${c.name}: reproduces bodySha256 and canonical exactly`, () => {
      expect(hashBody(c.body)).toBe(c.bodySha256);
      expect(hashBody(new TextEncoder().encode(c.body))).toBe(c.bodySha256);
      const canonical = buildCanonicalString({
        keyId: vectors.keyId,
        method: c.method,
        target: c.path,
        timestamp: c.timestamp,
        nonce: c.nonce,
        bodySha256: c.bodySha256,
      });
      expect(canonical).toBe(c.canonical);
    });

    it(`${c.name}: signature matches the strict header format`, () => {
      expect(c.signature).toMatch(SIGNATURE_RE);
    });
  }
});

describe("buildCanonicalString", () => {
  const base = {
    keyId: vectors.keyId,
    method: "post",
    target: "/sdk/v1/evaluate",
    timestamp: 1767225600,
    nonce: "bm9uY2UtMDAwMDAwMDAx",
    bodySha256: hashBody(""),
  };

  it("uppercases the method and stringifies a numeric timestamp", () => {
    const lines = buildCanonicalString(base).split("\n");
    expect(lines).toEqual([
      "POTATO-ED25519-V1",
      vectors.keyId,
      "POST",
      "/sdk/v1/evaluate",
      "1767225600",
      "bm9uY2UtMDAwMDAwMDAx",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ]);
    expect(buildCanonicalString(base).endsWith("\n")).toBe(false);
  });

  it.each([
    ["keyId", "key_lowercase0000000000000000"],
    ["method", "PO ST"],
    ["target", "sdk/v1/evaluate"],
    ["target", "/sdk/v1/eval uate"],
    ["timestamp", "01767225600"],
    ["nonce", "short"],
    ["bodySha256", "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"],
  ])("rejects a malformed %s (%j)", (field, value) => {
    expect(() => buildCanonicalString({ ...base, [field]: value })).toThrow(TypeError);
  });
});
