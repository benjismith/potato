import { useState } from 'react'
import { updateFlagConfig, type ConfigChanges } from '../api/flags'
import type { FlagConfig } from '../api/types'
import { errorMessage, isConflict } from './flagHelpers'

export type ConfigChangeset = Omit<ConfigChanges, 'version'>

export interface Notice {
  kind: 'conflict' | 'error'
  message: string
}

interface Options {
  environmentId: string
  /** Puts a config into the page's local state (for one flag). */
  applyConfig: (flagId: string, config: FlagConfig) => void
  /** Refetches the page's data, after a version conflict. */
  reload: () => void
}

/**
 * Writes changes to a flag's config in one environment, optimistically:
 * the change shows immediately, and is rolled back if the API rejects it.
 * On a `409` version conflict it refetches and explains what happened.
 */
export function useConfigWriter({ environmentId, applyConfig, reload }: Options) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<Notice | null>(null)

  async function write(flag: { id: string; key: string }, current: FlagConfig, changes: ConfigChangeset) {
    setNotice(null)
    setPending((ids) => new Set(ids).add(flag.id))
    applyConfig(flag.id, { ...current, ...changes })

    try {
      const saved = await updateFlagConfig(flag.id, environmentId, { version: current.version, ...changes })
      applyConfig(flag.id, saved)
    } catch (err) {
      applyConfig(flag.id, current)
      if (isConflict(err)) {
        setNotice({
          kind: 'conflict',
          message: `Someone else changed "${flag.key}" while you were editing it. We've loaded the latest version, so please check it and try again.`,
        })
        reload()
      } else {
        setNotice({ kind: 'error', message: `Couldn't update "${flag.key}": ${errorMessage(err)}` })
      }
    } finally {
      setPending((ids) => {
        const next = new Set(ids)
        next.delete(flag.id)
        return next
      })
    }
  }

  return { write, pending, notice, clearNotice: () => setNotice(null) }
}
