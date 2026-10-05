import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** The JSON body of every API error response. */
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
