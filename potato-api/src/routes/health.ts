import { Hono } from "hono";

export interface HealthDeps {
  /** Resolves if the database is reachable; rejects otherwise. */
  pingDb: () => Promise<void>;
}

export function healthRoutes(deps: HealthDeps) {
  return new Hono().get("/", async (c) => {
    let database: "ok" | "error" = "ok";
    let error: string | undefined;
    try {
      await deps.pingDb();
    } catch (err) {
      database = "error";
      error = err instanceof Error ? err.message : String(err);
    }
    return c.json({ status: "ok", database, ...(error && { error }) });
  });
}
