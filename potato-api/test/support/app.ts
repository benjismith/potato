import { createApp, type AppDeps } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";

/**
 * Builds the real app against the test database, running as `currentUserId`.
 * `pingDb` is stubbed to succeed unless overridden.
 */
export function createTestApp(db: Db, currentUserId: string, overrides: Partial<AppDeps> = {}) {
  return createApp({ pingDb: async () => {}, db, currentUserId, ...overrides });
}

/** Sends a JSON request and returns the status and parsed body. */
export async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await app.request(path, {
    method,
    ...(body !== undefined && {
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
