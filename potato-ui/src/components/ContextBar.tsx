import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { listApps } from '../api/tenancy'
import type { Environment, Org } from '../api/types'
import { useAsync } from '../hooks/useAsync'
import { appPath, orgPath, switchEnvPath, type EnvParams } from '../paths'

interface ContextBarProps {
  params: EnvParams
  orgs: Org[]
  environments: Environment[]
}

/**
 * The org, app and environment switchers under the header.
 *
 * Switching org or app goes to that org/app's first environment. Switching
 * environment stays on the same page (e.g. the same flag).
 */
export function ContextBar({ params, orgs, environments }: ContextBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const loadApps = useCallback(() => listApps(params.orgId), [params.orgId])
  const { state: apps } = useAsync(loadApps)

  return (
    <nav className="context-bar" aria-label="Context">
      <label>
        <span>Org</span>
        <select value={params.orgId} onChange={(e) => navigate(orgPath(e.target.value))}>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>App</span>
        <select
          value={params.appId}
          disabled={apps.status !== 'ok'}
          onChange={(e) => navigate(appPath(params.orgId, e.target.value))}
        >
          {apps.status === 'ok' ? (
            apps.data.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))
          ) : (
            <option value={params.appId}>{apps.status === 'loading' ? 'Loading…' : 'Error'}</option>
          )}
        </select>
      </label>

      <label>
        <span>Environment</span>
        <select
          value={params.envSlug}
          disabled={environments.length === 0}
          onChange={(e) => navigate(switchEnvPath(location.pathname, params, e.target.value) + location.search)}
        >
          {environments.length === 0 && <option value={params.envSlug}>{params.envSlug}</option>}
          {environments.map((env) => (
            <option key={env.id} value={env.slug}>
              {env.name}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}
