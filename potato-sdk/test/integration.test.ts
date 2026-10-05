/**
 * Integration test against a running potato-api. Skipped unless
 * POTATO_API_URL is set. See README "Integration test" for the env vars.
 */
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPotatoClient, PotatoError, PotatoFlags } from "../src/index.js";

const env = process.env;
const apiUrl = env.POTATO_API_URL;

function config() {
  const keyId = env.POTATO_KEY_ID;
  if (!keyId) throw new Error("POTATO_API_URL is set, so POTATO_KEY_ID must be set too");
  let privateKey = env.POTATO_PRIVATE_KEY;
  if (!privateKey && env.POTATO_PRIVATE_KEY_FILE) privateKey = readFileSync(env.POTATO_PRIVATE_KEY_FILE, "utf8");
  if (!privateKey) {
    // Default: the test-only vector key, whose public key must be registered as POTATO_KEY_ID.
    const vectors = JSON.parse(
      readFileSync(new URL("../../potato-planning/docs/signing-vectors.json", import.meta.url), "utf8"),
    ) as { privateKeyPem: string };
    privateKey = vectors.privateKeyPem;
  }
  return { apiUrl: apiUrl!, keyId, privateKey };
}

describe.skipIf(!apiUrl)("integration: evaluate against a running potato-api", () => {
  const subjectKey = env.POTATO_SUBJECT_KEY ?? "potato-sdk-integration";

  it("evaluates flags for a subject", async () => {
    const potato = createPotatoClient(config());
    const flags = await potato.evaluate({ key: subjectKey, attributes: { source: "potato-sdk integration test" } });
    expect(flags).toBeInstanceOf(PotatoFlags);
    if (env.POTATO_EXPECTED_FLAGS) {
      const expected = JSON.parse(env.POTATO_EXPECTED_FLAGS) as Record<string, unknown>;
      expect(flags.toJSON()).toMatchObject(expected);
    }
    expect(flags.get("potato-sdk-integration-no-such-flag", "fallback")).toBe("fallback");
  });

  it("can evaluate twice in a row (fresh nonce each time)", async () => {
    const potato = createPotatoClient(config());
    await potato.evaluate({ key: subjectKey });
    await expect(potato.evaluate({ key: subjectKey })).resolves.toBeInstanceOf(PotatoFlags);
  });

  it("gets 401 bad_signature when signing with the wrong private key", async () => {
    const wrongKey = generateKeyPairSync("ed25519").privateKey;
    const potato = createPotatoClient({ ...config(), privateKey: wrongKey });
    const err = await potato.evaluate({ key: subjectKey }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PotatoError);
    expect((err as PotatoError).status).toBe(401);
    expect((err as PotatoError).reason).toBe("bad_signature");
  });

  it("gets 401 unknown_key for an unregistered key ID", async () => {
    const potato = createPotatoClient({ ...config(), keyId: "key_00000000000000000000000000" });
    const err = await potato.evaluate({ key: subjectKey }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PotatoError);
    expect((err as PotatoError).status).toBe(401);
    expect((err as PotatoError).reason).toBe("unknown_key");
  });
});
