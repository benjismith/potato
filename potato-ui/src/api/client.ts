const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

/**
 * An error response from the API. `code` is the machine-readable `error`
 * field from the body (e.g. `validation_failed`, `version_conflict`), or
 * `network_error` / `http_error` when the body wasn't a JSON error.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ErrorBody {
  error?: string
  message?: string
  details?: unknown
}

/** Sends a JSON request to the API and returns the parsed response body. */
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new ApiError(0, 'network_error', `Network error: ${reason}`)
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as ErrorBody
    throw new ApiError(
      res.status,
      errorBody.error ?? 'http_error',
      errorBody.message ?? `${method} ${path} failed: ${res.status} ${res.statusText}`,
      errorBody.details,
    )
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Encodes a value for use as one URL path segment. */
export function seg(value: string): string {
  return encodeURIComponent(value)
}

export interface Health {
  status: string
  database: 'ok' | 'error'
  error?: string
}

export function fetchHealth(): Promise<Health> {
  return request<Health>('GET', '/health')
}
