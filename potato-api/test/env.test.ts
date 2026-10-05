import { describe, expect, it } from "vitest";
import { SEED_IDS } from "../src/db/seed.js";
import { loadEnv } from "../src/env.js";
import { newId } from "../src/ids.js";

const base = { DATABASE_URL: "mysql://root@localhost:3306/potato" };

describe("loadEnv", () => {
  it("defaults the current user to the seeded user", () => {
    expect(loadEnv(base).currentUserId).toBe(SEED_IDS.user);
    expect(loadEnv({ ...base, POTATO_CURRENT_USER_ID: "" }).currentUserId).toBe(
      SEED_IDS.user,
    );
  });

  it("accepts a configured current user", () => {
    const id = newId("usr");
    expect(loadEnv({ ...base, POTATO_CURRENT_USER_ID: id }).currentUserId).toBe(id);
  });

  it("rejects a malformed current user ID", () => {
    expect(() => loadEnv({ ...base, POTATO_CURRENT_USER_ID: "org_123" })).toThrow(
      /POTATO_CURRENT_USER_ID/,
    );
  });
});
