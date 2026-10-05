// v1 flag evaluation (potato-planning/docs/DATA-MODEL.md, "Evaluation (v1)").
// Pure: callers load the rows, this decides what each subject is served.

export interface EvalFlag {
  id: string;
  key: string;
}

export interface EvalVariation {
  id: string;
  flagId: string;
  value: unknown;
}

export interface EvalConfig {
  flagId: string;
  enabled: boolean;
  offVariationId: string;
  defaultVariationId: string;
}

/** A target for the subject being evaluated (already filtered to that subject). */
export interface EvalTarget {
  flagId: string;
  variationId: string;
}

export interface EvaluationInput {
  /** Non-archived flags of the environment's application. */
  flags: EvalFlag[];
  variations: EvalVariation[];
  /** This environment's configs. */
  configs: EvalConfig[];
  /** This environment's targets for this subject. */
  targets: EvalTarget[];
}

/**
 * Returns `{ flagKey: value }`:
 * disabled → off variation; targeted → target's variation; otherwise → default.
 * A flag with no config in this environment is omitted (that would break the
 * one-config-per-flag-per-environment invariant, so serve nothing rather than guess).
 */
export function evaluateFlags(input: EvaluationInput): Record<string, unknown> {
  const valueById = new Map(input.variations.map((v) => [v.id, v.value]));
  const configByFlag = new Map(input.configs.map((c) => [c.flagId, c]));
  const targetByFlag = new Map(input.targets.map((t) => [t.flagId, t.variationId]));

  const result: Record<string, unknown> = {};
  for (const flag of input.flags) {
    const config = configByFlag.get(flag.id);
    if (!config) continue;
    const variationId = !config.enabled
      ? config.offVariationId
      : (targetByFlag.get(flag.id) ?? config.defaultVariationId);
    if (valueById.has(variationId)) result[flag.key] = valueById.get(variationId);
  }
  return result;
}
