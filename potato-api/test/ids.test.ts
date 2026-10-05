import { describe, expect, it } from "vitest";
import { idPrefixes, isId, newId, ulid } from "../src/ids.js";

const CROCKFORD_26 = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("newId", () => {
  it("returns the prefix, an underscore, and a 26-char ULID", () => {
    const id = newId("org");
    expect(id).toMatch(/^org_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(id).toHaveLength(30); // fits varchar(30)
  });

  it("supports every table prefix", () => {
    for (const prefix of idPrefixes) {
      const id = newId(prefix);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(isId(id, prefix)).toBe(true);
    }
  });

  it("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId("flg")));
    expect(ids.size).toBe(10_000);
  });
});

describe("ulid", () => {
  it("encodes the timestamp in the first 10 chars, so IDs sort by time", () => {
    expect(ulid(0).slice(0, 10)).toBe("0000000000");
    // Example from the ULID spec: 1469918176385 → 01ARYZ6S41.
    expect(ulid(1469918176385).slice(0, 10)).toBe("01ARYZ6S41");
    expect(ulid(1_000) < ulid(2_000)).toBe(true);
    expect(ulid()).toMatch(CROCKFORD_26);
  });

  it("rejects out-of-range timestamps", () => {
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(2 ** 48)).toThrow(RangeError);
  });
});

describe("isId", () => {
  it("checks the format and, optionally, the prefix", () => {
    const id = newId("usr");
    expect(isId(id)).toBe(true);
    expect(isId(id, "usr")).toBe(true);
    expect(isId(id, "org")).toBe(false);
    expect(isId("usr_123")).toBe(false);
    expect(isId(`xyz_${ulid()}`)).toBe(false);
    expect(isId(id.toLowerCase())).toBe(false);
  });
});
