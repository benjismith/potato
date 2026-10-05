import { Hono } from "hono";
import { logger } from "hono/logger";
import { handleError, handleNotFound } from "./http/errors.js";
import { healthRoutes, type HealthDeps } from "./routes/health.js";
import { sdkRoutes, type SdkDeps } from "./routes/sdk/index.js";
import { managementRoutes, type ManagementDeps } from "./routes/v1/index.js";

export type AppDeps = HealthDeps & ManagementDeps & SdkDeps;

/** Builds the Hono app. Dependencies are injected so tests can stub them. */
export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use(logger());
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route("/health", healthRoutes(deps));
  app.route("/v1", managementRoutes(deps));
  app.route("/sdk/v1", sdkRoutes(deps));
  return app;
}

export type App = ReturnType<typeof createApp>;
