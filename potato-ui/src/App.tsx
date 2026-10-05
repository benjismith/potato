import { useEffect, useState } from 'react'
import { fetchHealth, type Health } from './api/client'

type HealthState =
  | { kind: 'loading' }
  | { kind: 'loaded'; health: Health }
  | { kind: 'failed'; message: string }

function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchHealth()
      .then((h) => !cancelled && setHealth({ kind: 'loaded', health: h }))
      .catch((err: unknown) => {
        if (cancelled) return
        setHealth({ kind: 'failed', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Potato</h1>
      </header>
      <main className="app-main">
        <section aria-label="API status" className="status">
          <h2>API status</h2>
          <p role="status">{describe(health)}</p>
        </section>
      </main>
    </div>
  )
}

function describe(state: HealthState): string {
  switch (state.kind) {
    case 'loading':
      return 'Checking…'
    case 'failed':
      return `API unreachable: ${state.message}`
    case 'loaded':
      return state.health.database === 'ok'
        ? 'API ok, database ok'
        : `API ok, database error: ${state.health.error ?? 'unknown'}`
  }
}

export default App
