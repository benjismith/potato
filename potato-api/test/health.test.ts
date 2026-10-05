import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("reports ok when the database is reachable", async () => {
    const app = createApp({ pingDb: async () => {} });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("reports a database error without failing the request", async () => {
    const app = createApp({
      pingDb: async () => {
        throw new Error("connection refused");
      },
    });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      database: "error",
      error: "connection refused",
    });
  });
});
