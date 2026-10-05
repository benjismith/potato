import type { FlagType } from '../api/types'

/** A variation as typed into the form; the value is parsed on submit. */
export interface VariationDraft {
  name: string
  valueText: string
}

interface VariationsEditorProps {
  type: FlagType
  variations: VariationDraft[]
  onChange: (variations: VariationDraft[]) => void
}

const placeholders: Record<FlagType, string> = {
  boolean: 'true',
  string: 'blue',
  number: '42',
  json: '{"limit": 10}',
}

/** Edits a list of variations (name + value), with at least two rows. */
export function VariationsEditor({ type, variations, onChange }: VariationsEditorProps) {
  function update(index: number, changes: Partial<VariationDraft>) {
    onChange(variations.map((v, i) => (i === index ? { ...v, ...changes } : v)))
  }

  return (
    <fieldset className="variations">
      <legend>Variations</legend>
      <p className="muted hint">
        The first variation is served by default when the flag is on; the last one when it's off.
      </p>
      {variations.map((variation, index) => (
        <div className="variation-row" key={index}>
          <input
            aria-label={`Variation ${index + 1} name`}
            placeholder="Name"
            value={variation.name}
            onChange={(e) => update(index, { name: e.target.value })}
          />
          <input
            aria-label={`Variation ${index + 1} value`}
            className="mono"
            placeholder={placeholders[type]}
            value={variation.valueText}
            onChange={(e) => update(index, { valueText: e.target.value })}
          />
          <button
            type="button"
            aria-label={`Remove variation ${index + 1}`}
            disabled={variations.length <= 2}
            onClick={() => onChange(variations.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...variations, { name: '', valueText: '' }])}>
        Add variation
      </button>
    </fieldset>
  )
}
