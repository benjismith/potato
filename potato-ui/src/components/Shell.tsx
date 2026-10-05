import { Link, Outlet } from 'react-router'
import { getMe } from '../api/tenancy'
import { useAsync } from '../hooks/useAsync'
import { MeContext } from '../me'
import { HealthIndicator } from './HealthIndicator'
import { ErrorMessage, Loading } from './Status'

/**
 * The page frame: header with the current user, the routed page, and a
 * footer with the API status. Loads `GET /v1/me` once for everything below.
 */
export function Shell() {
  const { state, reload } = useAsync(getMe)

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          Potato
        </Link>
        {state.status === 'ok' && (
          <span className="current-user" title={state.data.user.email}>
            {state.data.user.name}
          </span>
        )}
      </header>

      {state.status === 'loading' && (
        <main className="app-main">
          <Loading />
        </main>
      )}
      {state.status === 'error' && (
        <main className="app-main">
          <ErrorMessage title="Couldn't load your account" error={state.error} onRetry={reload} />
        </main>
      )}
      {state.status === 'ok' && (
        <MeContext value={state.data}>
          <Outlet />
        </MeContext>
      )}

      <footer className="app-footer">
        <HealthIndicator />
      </footer>
    </div>
  )
}
