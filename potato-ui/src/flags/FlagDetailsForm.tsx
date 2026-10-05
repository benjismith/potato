import { useState, type FormEvent } from 'react'
import { updateFlag } from '../api/flags'
import type { FlagDetail } from '../api/types'
import { ErrorMessage } from '../components/Status'
import { errorMessage } from './flagHelpers'

interface FlagDetailsFormProps {
  flag: FlagDetail
  onSaved: (flag: FlagDetail) => void
}

/** Edits a flag's name and description. */
export function FlagDetailsForm({ flag, onSaved }: FlagDetailsFormProps) {
  const [name, setName] = useState(flag.name)
  const [description, setDescription] = useState(flag.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = name !== flag.name || description !== (flag.description ?? '')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await updateFlag(flag.id, {
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
      })
      setName(updated.name)
      setDescription(updated.description ?? '')
      setSaved(true)
      onSaved(updated)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      <label>
        Description
        <textarea
          rows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      {error && <ErrorMessage title="Couldn't save" error={error} />}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && !dirty && <span className="muted">Saved.</span>}
      </div>
    </form>
  )
}
