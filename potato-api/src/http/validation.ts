import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { z } from "zod";
import { apiError } from "./errors.js";

/** Slugs and flag keys (DATA-MODEL.md). */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-_.]{0,63}$/;

export const slugSchema = z
  .string()
  .regex(SLUG_PATTERN, "Must be 1-64 chars of a-z, 0-9, '-', '_' or '.', starting with a letter or digit");

export const nameSchema = z.string().trim().min(1).max(255);

/** One entry of `details.issues` in a `validation_failed` error. */
export interface ValidationIssue {
  /** Dotted path to the failing field, e.g. `variations.1.value` (empty for the whole body). */
  path: string;
  message: string;
}

/** Turns a ZodError into the `details` of a `validation_failed` error. */
export function validationDetails(error: z.core.$ZodError): { issues: ValidationIssue[] } {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

/** Throws a `400 validation_failed` with a single issue. */
export function invalid(path: string, message: string): never {
  throw apiError(400, "validation_failed", `${path}: ${message}`, {
    issues: [{ path, message }],
  } satisfies { issues: ValidationIssue[] });
}

/**
 * zValidator, but a failure throws the standard `400 validation_failed`
 * error instead of returning Zod's own response.
 */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const details = validationDetails(result.error);
      const first = details.issues[0];
      const message = first
        ? `${first.path || target}: ${first.message}`
        : `Invalid request ${target}`;
      throw apiError(400, "validation_failed", message, details);
    }
  });
}
