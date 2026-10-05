import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ok'; data: T }

export interface AsyncResult<T> {
  state: AsyncState<T>
  /** Re-runs the loader, keeping the current data on screen meanwhile. */
  reload: () => void
  /** Replaces the loaded data locally (e.g. for optimistic updates). */
  setData: (update: (data: T) => T) => void
}

/**
 * Runs an async loader and tracks its loading/error/success state.
 *
 * Wrap the loader in `useCallback` with the values it depends on: whenever
 * the loader changes (e.g. a URL param changed), it runs again and the state
 * goes back to `loading`.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncResult<T> {
  // Remember which loader produced the stored state, so a new loader shows
  // `loading` instead of the previous loader's (stale) data.
  const [result, setResult] = useState<{ load: () => Promise<T>; state: AsyncState<T> }>()
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setResult({ load, state: { status: 'ok', data } })
      },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        setResult({ load, state: { status: 'error', error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, reloadCount])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  const setData = useCallback((update: (data: T) => T) => {
    setResult((prev) =>
      prev && prev.state.status === 'ok'
        ? { ...prev, state: { status: 'ok', data: update(prev.state.data) } }
        : prev,
    )
  }, [])

  const state: AsyncState<T> =
    result && result.load === load ? result.state : { status: 'loading' }
  return { state, reload, setData }
}
