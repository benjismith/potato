import { ApiError } from '../api/client'
import { FLAG_KEY_PATTERN } from '../api/flags'
import type { Flag, FlagConfig, FlagType, Variation } from '../api/types'

/** Returns an error message for an invalid flag key, or null if it's fine. */
export function validateFlagKey(key: string): string | null {
  if (key === '') return 'Key is required.'
  if (FLAG_KEY_PATTERN.test(key)) return null
  if (key.length > 64) return 'Key must be at most 64 characters.'
  return 'Use lowercase letters, digits, "-", "_" and ".", starting with a letter or digit.'
}

export type ParsedValue = { ok: true; value: unknown } | { ok: false; error: string }

/** Parses what the user typed as a variation value of the given flag type. */
export function parseVariationValue(type: FlagType, text: string): ParsedValue {
  switch (type) {
    case 'boolean':
      if (text === 'true') return { ok: true, value: true }
      if (text === 'false') return { ok: true, value: false }
      return { ok: false, error: 'Must be true or false.' }
    case 'string':
      return { ok: true, value: text }
    case 'number': {
      const value = Number(text)
      return text.trim() !== '' && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, error: 'Must be a number.' }
    }
    case 'json':
      try {
        return { ok: true, value: JSON.parse(text) as unknown }
      } catch {
        return { ok: false, error: 'Must be valid JSON.' }
      }
  }
}

/** A variation's value as short display text. */
export function formatValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}

export function findVariation(flag: Pick<Flag, 'variations'>, id: string): Variation | undefined {
  return flag.variations.find((v) => v.id === id)
}

/** The variation a config currently serves to subjects without a target. */
export function servedVariation(flag: Pick<Flag, 'variations'>, config: FlagConfig): Variation | undefined {
  return findVariation(flag, config.enabled ? config.defaultVariationId : config.offVariationId)
}

/** True for a `409` from a config write: someone else changed it first. */
export function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
