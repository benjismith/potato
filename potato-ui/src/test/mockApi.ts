import { vi } from 'vitest'

export interface MockRequest {
  url: URL
  body: unknown
}

/** A canned JSON response body, or a function that builds the Response. */
export type MockRoute = object | ((req: MockRequest) => Response | Promise<Response>)

/**
 * Replaces `fetch` with a fake API. Routes are keyed by `"METHOD /path"`,
 * without the `/api` prefix or query string, e.g. `"GET /v1/me"`.
 * Unmatched requests get a 404 `not_found` error. `GET /health` answers
 * "ok" unless overridden.
 */
export function mockApi(routes: Record<string, MockRoute>) {
  const allRoutes: Record<string, MockRoute> = {
    'GET /health': { status: 'ok', database: 'ok' },
    ...routes,
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`
    const route = allRoutes[key]
    if (!route) {
      return Response.json({ error: 'not_found', message: `No mock for ${key}` }, { status: 404 })
    }
    if (typeof route === 'function') {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
      return route({ url, body })
    }
    return Response.json(route)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The parsed JSON bodies sent to `"METHOD /path"` so far. */
export function sentBodies(fetchMock: ReturnType<typeof mockApi>, key: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = new URL(String(input), 'http://localhost')
      return `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}` === key
    })
    .map(([, init]) => (typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined))
}
