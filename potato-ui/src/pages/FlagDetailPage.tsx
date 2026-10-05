import { useCallback } from 'react'
import { Link, useParams } from 'react-router'
import { getFlag } from '../api/flags'
import type { FlagConfig, FlagDetail } from '../api/types'
import { ErrorMessage, Loading } from '../components/Status'
import { useEnv } from '../env'
import { ArchivePanel } from '../flags/ArchivePanel'
import { ConfigPanel } from '../flags/ConfigPanel'
import { FlagDetailsForm } from '../flags/FlagDetailsForm'
import { formatValue } from '../flags/flagHelpers'
import { NoticeBox } from '../flags/NoticeBox'
import { useConfigWriter } from '../flags/useConfigWriter'
import { useAsync } from '../hooks/useAsync'
import { flagsPath } from '../paths'

/** One flag: its details, its settings in the current environment, and archiving. */
export function FlagDetailPage() {
  const { params, environment } = useEnv()
  const { flagId = '' } = useParams()

  const load = useCallback(() => getFlag(flagId), [flagId])
  const { state, reload, setData } = useAsync(load)

  const applyConfig = useCallback(
    (_flagId: string, config: FlagConfig) =>
      setData((flag) => ({
        ...flag,
        configs: {
          ...flag.configs,
          // Spread the old config first, to keep its targets if `config` has none.
          [config.environmentId]: { ...flag.configs[config.environmentId], ...config },
        },
      })),
    [setData],
  )
  const writer = useConfigWriter({ environmentId: environment.id, applyConfig, reload })
  const replaceFlag = (flag: FlagDetail) => setData(() => flag)

  const backLink = (
    <p>
      <Link to={flagsPath(params)}>← All flags</Link>
    </p>
  )

  if (state.status === 'loading') return <>{backLink}<Loading /></>
  if (state.status === 'error') {
    return (
      <>
        {backLink}
        <ErrorMessage title="Couldn't load this flag" error={state.error} onRetry={reload} />
      </>
    )
  }

  const flag = state.data
  const config = flag.configs[environment.id]

  return (
    <>
      {backLink}
      <div className="page-title">
        <h1>
          <code>{flag.key}</code>
        </h1>
        <span className="badge">{flag.type}</span>
        {flag.archivedAt && <span className="badge">archived</span>}
      </div>

      <NoticeBox notice={writer.notice} onDismiss={writer.clearNotice} />

      <section className="panel">
        <h2>In {environment.name}</h2>
        {config ? (
          <ConfigPanel
            flag={flag}
            config={config}
            environmentName={environment.name}
            busy={writer.pending.has(flag.id)}
            onChange={(changes) => writer.write(flag, config, changes)}
          />
        ) : (
          <p className="muted">This flag has no configuration in {environment.name}.</p>
        )}
      </section>

      <section className="panel">
        <h2>Details</h2>
        <FlagDetailsForm key={flag.id} flag={flag} onSaved={replaceFlag} />
      </section>

      <section className="panel">
        <h2>Variations</h2>
        <ul className="variation-list">
          {flag.variations.map((v) => (
            <li key={v.id}>
              {v.name} <span className="muted mono">{formatValue(v.value)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Archive</h2>
        <ArchivePanel flag={flag} onChange={replaceFlag} />
      </section>
    </>
  )
}
