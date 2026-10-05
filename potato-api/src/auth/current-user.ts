import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Db } from "../db/client.js";
import { users, type User } from "../db/schema.js";
import { apiError } from "../http/errors.js";

/** Hono env for management routes: the authenticated user is on the context. */
export interface ManagementEnv {
  Variables: {
    currentUser: User;
  };
}

export interface CurrentUserDeps {
  db: Db;
  /**
   * The user to authenticate every request as (`POTATO_CURRENT_USER_ID`).
   * This is the v1 stub. Real authentication will replace only how this ID is
   * resolved, not the membership checks that use it.
   */
  currentUserId: string;
}

/**
 * Loads the configured current user and exposes it as `c.get("currentUser")`.
 * Responds `401` if that user doesn't exist (e.g. the database isn't seeded).
 */
export function currentUser(deps: CurrentUserDeps) {
  return createMiddleware<ManagementEnv>(async (c, next) => {
    const user = await deps.db.query.users.findFirst({
      where: eq(users.id, deps.currentUserId),
    });
    if (!user) {
      throw apiError(
        401,
        "unauthorized",
        "The configured current user does not exist. Run `npm run db:seed`, or check POTATO_CURRENT_USER_ID.",
      );
    }
    c.set("currentUser", user);
    await next();
  });
}
