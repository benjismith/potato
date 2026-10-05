import { Hono } from "hono";
import { currentUser, type CurrentUserDeps, type ManagementEnv } from "../../auth/current-user.js";
import { tenancyRoutes } from "./tenancy.js";

export type ManagementDeps = CurrentUserDeps;

/** The management API (`/v1`). Every route runs as the current user. */
export function managementRoutes(deps: ManagementDeps) {
  return new Hono<ManagementEnv>()
    .use("*", currentUser(deps))
    .route("/", tenancyRoutes(deps));
}
