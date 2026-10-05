import { useState } from 'react'
import { archiveFlag, unarchiveFlag } from '../api/flags'
import type { FlagDetail } from '../api/types'
import { ErrorMessage } from '../components/Status'
import { errorMessage } from './flagHelpers'

interface ArchivePanelProps {
  flag: FlagDetail
  onChange: (flag: FlagDetail) => void
}

/** Archive (with an inline confirmation) or unarchive a flag. */
export function ArchivePanel({ flag, onChange }: ArchivePanelProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: (flagId: string) => Promise<FlagDetail>) {
    setBusy(true)
    setError(null)
    try {
      onChange(await action(flag.id))
      setConfirming(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error && <ErrorMessage title="Couldn't update the flag" error={error} />}

      {flag.archivedAt ? (
        <>
          <p>This flag is archived, so SDKs no longer receive it in any environment.</p>
          <button type="button" disabled={busy} onClick={() => run(unarchiveFlag)}>
            Unarchive flag
          </button>
        </>
      ) : confirming ? (
        <div className="confirm">
          <p>
            Archive <code>{flag.key}</code>? SDKs will stop receiving it in every environment. You can unarchive it
            later.
          </p>
          <button type="button" className="danger" disabled={busy} onClick={() => run(archiveFlag)}>
            Yes, archive it
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          Archive flag
        </button>
      )}
    </div>
  )
}
