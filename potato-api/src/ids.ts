import { randomBytes } from "node:crypto";

/** ID prefixes, per table (see DATA-MODEL.md). */
export const idPrefixes = ["org", "usr", "app", "env", "key", "flg", "var"] as const;
export type IdPrefix = (typeof idPrefixes)[number];

/** Crockford's base32, as used by ULID. */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10; // 48-bit millisecond timestamp
const RANDOM_LENGTH = 16; // 80 random bits

let lastTime = -1;
let lastRandom = new Uint8Array(RANDOM_LENGTH);

/**
 * Returns a 26-character ULID: a 48-bit millisecond timestamp followed by
 * 80 random bits, both in Crockford base32.
 *
 * IDs are monotonic within a millisecond: if called again with the same
 * timestamp, the random part of the previous ID is incremented rather than
 * redrawn, so IDs generated in quick succession also sort in sequence.
 */
export function ulid(now: number = Date.now()): string {
  if (!Number.isInteger(now) || now < 0 || now >= 2 ** 48) {
    throw new RangeError(`ULID timestamp out of range: ${now}`);
  }
  if (now !== lastTime) {
    lastTime = now;
    // Each digit is 5 bits; keep one random 0..31 value per digit.
    lastRandom = randomBytes(RANDOM_LENGTH).map((byte) => byte & 31);
  } else {
    incrementBase32(lastRandom);
  }
  return encodeTime(lastTime) + Array.from(lastRandom, (d) => ENCODING.charAt(d)).join("");
}

function encodeTime(time: number): string {
  let out = "";
  for (let i = 0, t = time; i < TIME_LENGTH; i++, t = Math.floor(t / 32)) {
    out = ENCODING.charAt(t % 32) + out;
  }
  return out;
}

/** Adds 1 to a big-endian array of base-32 digits, in place. */
function incrementBase32(digits: Uint8Array): void {
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i]! < 31) {
      digits[i]! += 1;
      return;
    }
    digits[i] = 0;
  }
  throw new Error("ULID random component overflowed within one millisecond");
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
