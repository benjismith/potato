import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function mockFetch(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  )
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the app shell and reports a healthy API', async () => {
    mockFetch(Response.json({ status: 'ok', database: 'ok' }))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Potato' })).toBeInTheDocument()
    expect(await screen.findByText('API ok, database ok')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/health')
  })

  it('reports when the API is unreachable', async () => {
    mockFetch(new Error('Failed to fetch'))
    render(<App />)
    expect(await screen.findByText('API unreachable: Failed to fetch')).toBeInTheDocument()
  })
})
