import { useCallback } from 'react'
import { Outlet, useParams } from 'react-router'
import { getApp, listEnvironments } from '../api/tenancy'
import { ContextBar } from '../components/ContextBar'
import { ErrorMessage, Loading } from '../components/Status'
import { useAsync } from '../hooks/useAsync'
import type { EnvContext } from '../env'
import { useMe } from '../me'
import type { EnvParams } from '../paths'

/**
 * Layout for every environment-scoped page: resolves the URL params into
 * org, app and environment records, and shows the org/app/env switchers.
 */
export function EnvironmentLayout() {
  const me = useMe()
  const { orgId = '', appId = '', envSlug = '' } = useParams()
  const load = useCallback(
    () => Promise.all([getApp(appId), listEnvironments(appId)]),
    [appId],
  )
  const { state, reload } = useAsync(load)

  const params: EnvParams = { orgId, appId, envSlug }
  const org = me.orgs.find((o) => o.id === orgId)

  let content
  if (!org) {
    content = <ErrorMessage title="Not found" error={`Organization ${orgId} not found.`} />
  } else if (state.status === 'loading') {
    content = <Loading />
  } else if (state.status === 'error') {
    content = <ErrorMessage title="Couldn't load this app" error={state.error} onRetry={reload} />
  } else {
    const [app, environments] = state.data
    const environment = environments.find((e) => e.slug === envSlug)
    if (app.orgId !== org.id) {
      content = <ErrorMessage title="Not found" error={`App ${appId} not found in ${org.name}.`} />
    } else if (!environment) {
      content = <ErrorMessage title="Not found" error={`Environment "${envSlug}" not found in ${app.name}.`} />
    } else {
      const context: EnvContext = { params, org, app, environment, environments }
      content = <Outlet context={context} />
    }
  }

  return (
    <>
      <ContextBar
        params={params}
        orgs={me.orgs}
        environments={state.status === 'ok' ? state.data[1] : []}
      />
      <main className="app-main">{content}</main>
    </>
  )
}
