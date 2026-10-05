import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listFlags } from '../api/flags'
import type { Flag, FlagConfig } from '../api/types'
import { ErrorMessage, Loading } from '../components/Status'
import { useEnv } from '../env'
import { formatValue, servedVariation } from '../flags/flagHelpers'
import { NoticeBox } from '../flags/NoticeBox'
import { Toggle } from '../flags/Toggle'
import { useConfigWriter } from '../flags/useConfigWriter'
import { useAsync } from '../hooks/useAsync'
import { flagPath, newFlagPath } from '../paths'

/** The flags of the current app, with on/off toggles for the current environment. */
export function FlagListPage() {
  const { params, app, environment } = useEnv()
  const [searchParams, setSearchParams] = useSearchParams()
  const showArchived = searchParams.get('archived') === 'true'

  const load = useCallback(() => listFlags(app.id, { archived: showArchived }), [app.id, showArchived])
  const { state, reload, setData } = useAsync(load)

  const applyConfig = useCallback(
    (flagId: string, config: FlagConfig) =>
      setData((flags) =>
        flags.map((f) =>
          f.id === flagId ? { ...f, configs: { ...f.configs, [config.environmentId]: config } } : f,
        ),
      ),
    [setData],
  )
  const writer = useConfigWriter({ environmentId: environment.id, applyConfig, reload })

  function setShowArchived(show: boolean) {
    setSearchParams(show ? { archived: 'true' } : {}, { replace: true })
  }

  return (
    <>
      <div className="page-title">
        <h1>Flags</h1>
        <Link className="button primary" to={newFlagPath(params)}>
          New flag
        </Link>
      </div>
      <p className="muted">
        Toggles and served variations are for <strong>{environment.name}</strong>.
      </p>

      <label className="inline-check">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived flags
      </label>

      <NoticeBox notice={writer.notice} onDismiss={writer.clearNotice} />

      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && (
        <ErrorMessage title="Couldn't load flags" error={state.error} onRetry={reload} />
      )}
      {state.status === 'ok' && state.data.length === 0 && (
        <p className="empty">
          No flags yet. <Link to={newFlagPath(params)}>Create one</Link>.
        </p>
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <table className="flag-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Type</th>
              <th>Enabled</th>
              <th>Serving</th>
            </tr>
          </thead>
          <tbody>
            {state.data.map((flag) => (
              <FlagRow
                key={flag.id}
                flag={flag}
                environmentId={environment.id}
                href={flagPath(params, flag.id)}
                busy={writer.pending.has(flag.id)}
                onToggle={(config, enabled) => writer.write(flag, config, { enabled })}
              />
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

interface FlagRowProps {
  flag: Flag
  environmentId: string
  href: string
  busy: boolean
  onToggle: (config: FlagConfig, enabled: boolean) => void
}

function FlagRow({ flag, environmentId, href, busy, onToggle }: FlagRowProps) {
  const config = flag.configs[environmentId]
  const served = config && servedVariation(flag, config)

  return (
    <tr>
      <td>
        <Link to={href} className="mono">
          {flag.key}
        </Link>
        {flag.archivedAt && <span className="badge">archived</span>}
      </td>
      <td>{flag.name}</td>
      <td className="muted">{flag.type}</td>
      <td>
        {config ? (
          <Toggle
            checked={config.enabled}
            label={`Enable ${flag.key}`}
            disabled={busy}
            onChange={(enabled) => onToggle(config, enabled)}
          />
        ) : (
          <span className="muted">No config</span>
        )}
      </td>
      <td>
        {served ? (
          <>
            {served.name} <span className="muted mono">{formatValue(served.value)}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  )
}
