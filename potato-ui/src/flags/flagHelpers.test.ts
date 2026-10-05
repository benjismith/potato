import { describe, expect, it } from 'vitest'
import { parseVariationValue, validateFlagKey } from './flagHelpers'

describe('validateFlagKey', () => {
  it.each(['a', 'new-checkout', 'v2.pricing_page', '0day', 'a'.repeat(64)])('accepts %s', (key) => {
    expect(validateFlagKey(key)).toBeNull()
  })

  it.each(['', 'Upper', '-leading', '_leading', '.leading', 'has space', 'emoji🥔', 'a'.repeat(65)])(
    'rejects %j',
    (key) => {
      expect(validateFlagKey(key)).not.toBeNull()
    },
  )
})

describe('parseVariationValue', () => {
  it('parses numbers and JSON, and keeps strings as typed', () => {
    expect(parseVariationValue('number', '1.5')).toEqual({ ok: true, value: 1.5 })
    expect(parseVariationValue('number', '')).toMatchObject({ ok: false })
    expect(parseVariationValue('json', '{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseVariationValue('json', '{oops')).toMatchObject({ ok: false })
    expect(parseVariationValue('string', ' blue ')).toEqual({ ok: true, value: ' blue ' })
  })
})
