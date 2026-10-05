import { Hono } from "hono";
import { logger } from "hono/logger";
import { healthRoutes, type HealthDeps } from "./routes/health.js";

export type AppDeps = HealthDeps;

/** Builds the Hono app. Dependencies are injected so tests can stub them. */
export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use(logger());
  app.route("/health", healthRoutes(deps));
  return app;
}

export type App = ReturnType<typeof createApp>;
