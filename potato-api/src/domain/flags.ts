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
