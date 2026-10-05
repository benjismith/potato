import { randomBytes } from "node:crypto";

/** ID prefixes, per table (see DATA-MODEL.md). */
export const idPrefixes = ["org", "usr", "app", "env", "key", "flg", "var"] as const;
export type IdPrefix = (typeof idPrefixes)[number];

/** Crockford's base32, as used by ULID. */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10; // 48-bit millisecond timestamp
const RANDOM_LENGTH = 16; // 80 random bits

/**
 * Returns a 26-character ULID: a 48-bit millisecond timestamp followed by
 * 80 bits from the CSPRNG, both in Crockford base32.
 */
export function ulid(now: number = Date.now()): string {
  if (!Number.isInteger(now) || now < 0 || now >= 2 ** 48) {
    throw new RangeError(`ULID timestamp out of range: ${now}`);
  }
  let time = "";
  for (let i = 0, t = now; i < TIME_LENGTH; i++, t = Math.floor(t / 32)) {
    time = ENCODING.charAt(t % 32) + time;
  }
  let random = "";
  // Each byte's low 5 bits are uniform over 0..31.
  for (const byte of randomBytes(RANDOM_LENGTH)) {
    random += ENCODING.charAt(byte & 31);
  }
  return time + random;
}

/** Returns a new prefixed ID, e.g. `newId("org")` → `org_01J9Z…`. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

const ID_PATTERN = new RegExp(`^(${idPrefixes.join("|")})_[${ENCODING}]{26}$`);

/** True if `value` is a well-formed prefixed ID (optionally with `prefix`). */
export function isId(value: string, prefix?: IdPrefix): boolean {
  const match = ID_PATTERN.exec(value);
  return match !== null && (prefix === undefined || match[1] === prefix);
}
