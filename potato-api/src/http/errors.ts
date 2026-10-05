import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** The JSON body of every API error response (see API.md). */
export interface ApiErrorBody {
  /** Machine-readable code, e.g. `not_found`. */
  error: string;
  /** Human-readable explanation. */
  message: string;
  details?: unknown;
}

/**
 * Builds an HTTPException whose response is a JSON `ApiErrorBody`. Throw it
 * from a handler or middleware, and Hono returns its response.
 */
export function apiError(
  status: ContentfulStatusCode,
  error: string,
  message: string,
  details?: unknown,
): HTTPException {
  const body: ApiErrorBody = { error, message, ...(details !== undefined && { details }) };
  return new HTTPException(status, {
    message,
    res: Response.json(body, { status }),
  });
}

export const notFound = (resource: string) =>
  apiError(404, "not_found", `${resource} not found`);

/** `app.onError`: renders every error as an `ApiErrorBody`. */
export function handleError(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    // Thrown by apiError(): already a JSON error response.
    if (err.res) return err.res;
    // Thrown by Hono itself, e.g. a malformed JSON request body.
    const error = err.status === 400 ? "validation_failed" : "http_error";
    return c.json({ error, message: err.message } satisfies ApiErrorBody, err.status);
  }
  console.error(err);
  return c.json(
    { error: "internal_error", message: "Internal server error" } satisfies ApiErrorBody,
    500,
  );
}

/** `app.notFound`: unknown routes get the standard `404` body. */
export function handleNotFound(c: Context): Response {
  return c.json(
    { error: "not_found", message: `No route for ${c.req.method} ${c.req.path}` } satisfies ApiErrorBody,
    404,
  );
}

/** True if `err` (or its cause, as Drizzle wraps driver errors) is a MySQL duplicate-key error. */
export function isDuplicateKeyError(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === "ER_DUP_ENTRY") return true;
  }
  return false;
}
