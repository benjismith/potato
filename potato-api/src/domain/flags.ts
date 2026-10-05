/**
 * The variations a new config serves (API.md): off → the last variation,
 * default → the first. For booleans that's off → `false`, default → `true`.
 *
 * @param variations the flag's variations, sorted by `sortOrder`
 */
export function defaultConfigVariations(variations: readonly { id: string }[]): {
  offVariationId: string;
  defaultVariationId: string;
} {
  const first = variations[0];
  const last = variations[variations.length - 1];
  if (!first || !last || variations.length < 2) {
    throw new Error("A flag must have at least two variations");
  }
  return { offVariationId: last.id, defaultVariationId: first.id };
}

/** The variations every new boolean flag gets (API.md). */
export const BOOLEAN_VARIATIONS = [
  { name: "On", value: true },
  { name: "Off", value: false },
] as const;

/**
 * Returns an error message if `value` doesn't match the flag type, or `null`
 * if it does. `json` flags accept any JSON value.
 */
export function variationValueError(
  type: "boolean" | "string" | "number" | "json",
  value: unknown,
): string | null {
  switch (type) {
    case "boolean":
      return typeof value === "boolean" ? null : "Must be a boolean";
    case "string":
      return typeof value === "string" ? null : "Must be a string";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "Must be a number";
    case "json":
      return value === undefined ? "Required" : null;
  }
}
