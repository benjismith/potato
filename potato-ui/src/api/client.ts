const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export interface Health {
  status: string
  database: 'ok' | 'error'
  error?: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export function fetchHealth(): Promise<Health> {
  return getJson<Health>('/health')
}
