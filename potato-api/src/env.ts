import { SEED_IDS } from "./db/seed.js";
import { isId } from "./ids.js";

export interface Env {
  port: number;
  databaseUrl: string;
  /**
   * The user every management request runs as, until real authentication
   * exists. Defaults to the seeded user.
   */
  currentUserId: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (see .env.example)");
  }
  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${source.PORT}"`);
  }
  const currentUserId = source.POTATO_CURRENT_USER_ID || SEED_IDS.user;
  if (!isId(currentUserId, "usr")) {
    throw new Error(
      `POTATO_CURRENT_USER_ID must be a user ID (usr_ + 26-char ULID), got "${currentUserId}"`,
    );
  }
  return { port, databaseUrl, currentUserId };
}
