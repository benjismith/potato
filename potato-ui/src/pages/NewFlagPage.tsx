import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { createFlag, type NewFlag } from '../api/flags'
import type { FlagType } from '../api/types'
import { ErrorMessage } from '../components/Status'
import { useEnv } from '../env'
import { errorMessage, parseVariationValue, validateFlagKey } from '../flags/flagHelpers'
import { VariationsEditor, type VariationDraft } from '../flags/VariationsEditor'
import { flagPath, flagsPath } from '../paths'

const emptyVariations: VariationDraft[] = [
  { name: '', valueText: '' },
  { name: '', valueText: '' },
]

/** The "create flag" form. */
export function NewFlagPage() {
  const { params, app } = useEnv()
  const navigate = useNavigate()

  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<FlagType>('boolean')
  const [variations, setVariations] = useState<VariationDraft[]>(emptyVariations)
  const [keyTouched, setKeyTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyError = validateFlagKey(key)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setKeyTouched(true)
    setError(null)
    if (keyError) return
    if (name.trim() === '') {
      setError('Name is required.')
      return
    }

    const input: NewFlag = { key, name: name.trim(), type }
    if (description.trim() !== '') input.description = description.trim()
    if (type !== 'boolean') {
      const parsed = parseVariations(type, variations)
      if (typeof parsed === 'string') {
        setError(parsed)
        return
      }
      input.variations = parsed
    }

    setSaving(true)
    try {
      const flag = await createFlag(app.id, input)
      navigate(flagPath(params, flag.id))
    } catch (err) {
      setSaving(false)
      setError(
        err instanceof ApiError && err.status === 409
          ? `A flag with the key "${key}" already exists in ${app.name}.`
          : errorMessage(err),
      )
    }
  }

  return (
    <>
      <p>
        <Link to={flagsPath(params)}>← All flags</Link>
      </p>
      <h1>New flag</h1>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="flag-key">Key</label>
          <input
            id="flag-key"
            className="mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onBlur={() => setKeyTouched(true)}
            aria-invalid={keyTouched && keyError ? true : undefined}
            aria-describedby="key-help"
            autoFocus
          />
          <small id="key-help" className={keyTouched && keyError ? 'field-error' : 'muted'}>
            {keyTouched && keyError
              ? keyError
              : 'What your code passes to the SDK. Lowercase letters, digits, "-", "_" and ".". Can’t be changed later.'}
          </small>
        </div>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label>
          Description <span className="muted">(optional)</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as FlagType)}>
            <option value="boolean">Boolean</option>
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="json">JSON</option>
          </select>
        </label>

        {type === 'boolean' ? (
          <p className="muted hint">Boolean flags get two variations automatically: On (true) and Off (false).</p>
        ) : (
          <VariationsEditor type={type} variations={variations} onChange={setVariations} />
        )}

        {error && <ErrorMessage title="Couldn't create the flag" error={error} />}

        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create flag'}
          </button>
          <Link to={flagsPath(params)}>Cancel</Link>
        </div>
      </form>
    </>
  )
}

/** Parses the drafts into API variations, or returns an error message. */
function parseVariations(type: FlagType, drafts: VariationDraft[]): NewFlag['variations'] | string {
  if (drafts.length < 2) return 'Add at least two variations.'
  const result: { name: string; value: unknown }[] = []
  for (const [index, draft] of drafts.entries()) {
    if (draft.name.trim() === '') return `Variation ${index + 1} needs a name.`
    const parsed = parseVariationValue(type, draft.valueText)
    if (!parsed.ok) return `Variation ${index + 1}: ${parsed.error}`
    result.push({ name: draft.name.trim(), value: parsed.value })
  }
  return result
}
