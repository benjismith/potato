import { useAsync, type AsyncState } from '../hooks/useAsync'
import { fetchHealth, type Health } from '../api/client'

/** A one-line API/database status, shown in the footer. */
export function HealthIndicator() {
  const { state } = useAsync(fetchHealth)
  const tone = state.status === 'loading' ? '' : state.status === 'ok' && state.data.database === 'ok' ? 'ok' : 'bad'
  return (
    <span className="health" role="status" aria-label="API status">
      <span className={`health-dot ${tone}`} aria-hidden="true" />
      {describe(state)}
    </span>
  )
}

function describe(state: AsyncState<Health>): string {
  switch (state.status) {
    case 'loading':
      return 'Checking API…'
    case 'error':
      return `API unreachable: ${state.error.message}`
    case 'ok':
      return state.data.database === 'ok'
        ? 'API ok, database ok'
        : `API ok, database error: ${state.data.error ?? 'unknown'}`
  }
}
