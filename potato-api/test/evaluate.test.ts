import { describe, expect, it } from "vitest";
import { environments, signingKeys, subjects } from "../src/db/schema.js";
import { evaluateFlags } from "../src/domain/evaluate.js";
import { newId } from "../src/ids.js";
import { freshNonce, signHeaders, vectors } from "./sdk-auth/support.js";
import { call, createTestApp } from "./support/app.js";
import { useTestDb } from "./support/db.js";
import { createTenant } from "./support/fixtures.js";

describe("evaluateFlags (pure)", () => {
  const flags = [{ id: "f1", key: "checkout" }];
  const variations = [
    { id: "on", flagId: "f1", value: true },
    { id: "off", flagId: "f1", value: false },
  ];
  const config = { flagId: "f1", offVariationId: "off", defaultVariationId: "on" };

  it("serves the off variation when disabled, even for a targeted subject", () => {
    const result = evaluateFlags({
      flags,
      variations,
      configs: [{ ...config, enabled: false }],
      targets: [{ flagId: "f1", variationId: "on" }],
    });
    expect(result).toEqual({ checkout: false });
  });

  it("serves the default variation when enabled", () => {
    expect(evaluateFlags({ flags, variations, configs: [{ ...config, enabled: true }], targets: [] })).toEqual({
      checkout: true,
    });
  });

  it("serves the targeted variation when enabled and the subject is targeted", () => {
    const result = evaluateFlags({
      flags,
      variations,
      configs: [{ ...config, enabled: true }],
      targets: [{ flagId: "f1", variationId: "off" }],
    });
    expect(result).toEqual({ checkout: false });
  });

  it("omits flags that are not passed in (archived) or have no config", () => {
    expect(evaluateFlags({ flags, variations, configs: [], targets: [] })).toEqual({});
    expect(evaluateFlags({ flags: [], variations, configs: [{ ...config, enabled: true }], targets: [] })).toEqual({});
  });
});

describe("POST /sdk/v1/evaluate", () => {
  const ctx = useTestDb();

  /** One tenant, two environments; the test key is registered to `envA`. */
  async function setup() {
    const { db } = ctx;
    const tenant = await createTenant(db, "acme");
    const envB = newId("env");
    await db
      .insert(environments)
      .values({ id: envB, applicationId: tenant.appId, slug: "staging", name: "Staging" });
    await db.insert(signingKeys).values({
      id: vectors.keyId,
      environmentId: tenant.envId,
      label: "test",
      algorithm: "ed25519",
      publicKeyPem: vectors.publicKeyPem,
      createdBy: tenant.userId,
    });
    const app = createTestApp(db, tenant.userId);
    const created = await call(app, "POST", `/v1/apps/${tenant.appId}/flags`, {
      key: "checkout",
      name: "Checkout",
      type: "boolean",
    });
    expect(created.status).toBe(201);
    return { app, tenant, envA: tenant.envId, envB, flag: created.body.flag };
  }

  async function evaluate(app: ReturnType<typeof createTestApp>, body: unknown) {
    const raw = JSON.stringify(body);
    const headers = signHeaders({
      method: "POST",
      target: "/sdk/v1/evaluate",
      body: raw,
      timestamp: String(Math.floor(Date.now() / 1000)),
      nonce: freshNonce(),
    });
    const res = await app.request("/sdk/v1/evaluate", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: raw,
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  async function setEnabled(app: ReturnType<typeof createTestApp>, flag: any, envId: string, enabled: boolean) {
    const res = await call(app, "PATCH", `/v1/flags/${flag.id}/environments/${envId}`, {
      version: flag.configs[envId].version,
      enabled,
    });
    expect(res.status).toBe(200);
    return res.body.config;
  }

  it("rejects unsigned requests", async () => {
    const { app } = await setup();
    const res = await call(app, "POST", "/sdk/v1/evaluate", { subject: { key: "alice" } });
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("missing_or_malformed_headers");
  });

  it("serves off, then default, then the targeted variation", async () => {
    const { app, flag, envA } = await setup();
    expect(await evaluate(app, { subject: { key: "alice" } })).toEqual({
      status: 200,
      body: { flags: { checkout: false } },
    });

    const config = await setEnabled(app, flag, envA, true);
    expect((await evaluate(app, { subject: { key: "alice" } })).body).toEqual({ flags: { checkout: true } });

    const off = flag.variations.find((v: any) => v.value === false);
    const target = await call(app, "PUT", `/v1/flags/${flag.id}/environments/${envA}/targets/bob`, {
      version: config.version,
      variationId: off.id,
    });
    expect(target.status).toBe(200);
    expect((await evaluate(app, { subject: { key: "bob" } })).body).toEqual({ flags: { checkout: false } });
    expect((await evaluate(app, { subject: { key: "alice" } })).body).toEqual({ flags: { checkout: true } });
  });

  it("only reads the signing key's own environment", async () => {
    const { app, flag, envB } = await setup();
    await setEnabled(app, flag, envB, true); // enabled in B, still off in A (the key's environment)
    expect((await evaluate(app, { subject: { key: "alice" } })).body).toEqual({ flags: { checkout: false } });
  });

  it("omits archived flags", async () => {
    const { app, flag } = await setup();
    expect((await call(app, "POST", `/v1/flags/${flag.id}/archive`)).status).toBe(200);
    expect((await evaluate(app, { subject: { key: "alice" } })).body).toEqual({ flags: {} });
  });

  it("rejects invalid subjects with 400 validation_failed", async () => {
    const { app } = await setup();
    for (const body of [{}, { subject: {} }, { subject: { key: "" } }, { subject: { key: "x".repeat(256) } }]) {
      const res = await evaluate(app, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("validation_failed");
    }
  });

  it("records the subject on first evaluation and updates it later", async () => {
    const { app, envA } = await setup();
    await evaluate(app, { subject: { key: "alice", attributes: { plan: "free" } } });
    const [first] = await ctx.db.select().from(subjects);
    expect(first).toMatchObject({ environmentId: envA, key: "alice", attributes: { plan: "free" } });

    await new Promise((r) => setTimeout(r, 5));
    await evaluate(app, { subject: { key: "alice", attributes: { plan: "pro" } } });
    const rows = await ctx.db.select().from(subjects);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attributes).toEqual({ plan: "pro" });
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(first!.lastSeenAt.getTime());
    expect(rows[0]!.firstSeenAt.getTime()).toBe(first!.firstSeenAt.getTime());
  });
});
