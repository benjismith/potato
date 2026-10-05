import { useCallback } from 'react'
import { Navigate, useParams } from 'react-router'
import { listApps, listEnvironments, type Me } from '../api/tenancy'
import { ErrorMessage, Loading } from '../components/Status'
import { useAsync } from '../hooks/useAsync'
import { useMe } from '../me'
import { flagsPath } from '../paths'

type Destination = { kind: 'redirect'; to: string } | { kind: 'empty'; message: string }

/**
 * Handles `/`, `/orgs/:orgId` and `/orgs/:orgId/apps/:appId`: fills in
 * whatever the URL leaves out with the first org, app and environment, then
 * redirects to that environment's flags page.
 */
export function StartRedirect() {
  const me = useMe()
  const { orgId, appId } = useParams()
  const load = useCallback(() => findDestination(me, orgId, appId), [me, orgId, appId])
  const { state, reload } = useAsync(load)

  if (state.status === 'loading') return <main className="app-main"><Loading /></main>
  if (state.status === 'error') {
    return (
      <main className="app-main">
        <ErrorMessage error={state.error} onRetry={reload} />
      </main>
    )
  }
  if (state.data.kind === 'empty') {
    return (
      <main className="app-main">
        <p className="empty">{state.data.message}</p>
      </main>
    )
  }
  return <Navigate to={state.data.to} replace />
}

async function findDestination(me: Me, orgId?: string, appId?: string): Promise<Destination> {
  const org = orgId ? me.orgs.find((o) => o.id === orgId) : me.orgs[0]
  if (!org) {
    return {
      kind: 'empty',
      message: orgId ? `Organization ${orgId} not found.` : "You aren't a member of any organization yet.",
    }
  }

  const targetAppId = appId ?? (await listApps(org.id))[0]?.id
  if (!targetAppId) {
    return { kind: 'empty', message: `${org.name} has no apps yet.` }
  }

  const [env] = await listEnvironments(targetAppId)
  if (!env) {
    return { kind: 'empty', message: 'This app has no environments yet.' }
  }

  return { kind: 'redirect', to: flagsPath({ orgId: org.id, appId: targetAppId, envSlug: env.slug }) }
}
