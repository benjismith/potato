import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from './test/mockApi'
import { devFlagsPath, tenancyRoutes } from './test/fixtures'
import { renderApp } from './test/render'

const flagRoutes = { 'GET /v1/apps/app_1/flags': { flags: [] } }

function location() {
  return screen.getByTestId('location').textContent
}

describe('App shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects / to the first org, app and environment', async () => {
    mockApi({ ...tenancyRoutes, ...flagRoutes })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: /flags/i })).toBeInTheDocument()
    expect(location()).toBe(devFlagsPath)
    expect(screen.getByText('Potato User')).toBeInTheDocument()
  })

  it('redirects /orgs/:orgId/apps/:appId to that app’s first environment', async () => {
    mockApi({ ...tenancyRoutes, ...flagRoutes })
    renderApp('/orgs/org_1/apps/app_1')
    await screen.findByRole('heading', { name: /flags/i })
    expect(location()).toBe(devFlagsPath)
  })

  it('says so when the org has no apps', async () => {
    mockApi({ ...tenancyRoutes, 'GET /v1/orgs/org_1/apps': { apps: [] } })
    renderApp('/')
    expect(await screen.findByText('Default Org has no apps yet.')).toBeInTheDocument()
  })

  it('switching environments changes the URL and keeps the page', async () => {
    mockApi({ ...tenancyRoutes, ...flagRoutes })
    renderApp(`${devFlagsPath}?archived=true`)
    const select = await screen.findByRole('combobox', { name: 'Environment' })
    await screen.findByRole('heading', { name: /flags/i })

    await userEvent.selectOptions(select, 'Production')

    expect(location()).toBe('/orgs/org_1/apps/app_1/envs/production/flags?archived=true')
    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveValue('production')
  })

  it('shows an inline error when /v1/me fails, and can retry', async () => {
    let fail = true
    mockApi({
      ...tenancyRoutes,
      ...flagRoutes,
      'GET /v1/me': () =>
        fail
          ? Response.json({ error: 'unauthorized', message: 'No such user' }, { status: 401 })
          : Response.json(tenancyRoutes['GET /v1/me']),
    })
    renderApp('/')

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('No such user')).toBeInTheDocument()

    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: /flags/i })).toBeInTheDocument()
  })

  it('shows an inline error for an unknown environment', async () => {
    mockApi({ ...tenancyRoutes, ...flagRoutes })
    renderApp('/orgs/org_1/apps/app_1/envs/staging/flags')
    expect(await screen.findByRole('alert')).toHaveTextContent('Environment "staging" not found')
  })

  it('shows an inline error when the app fails to load', async () => {
    mockApi({
      ...tenancyRoutes,
      'GET /v1/apps/app_1': () => Response.json({ error: 'not_found', message: 'App not found' }, { status: 404 }),
    })
    renderApp(devFlagsPath)
    expect(await screen.findByRole('alert')).toHaveTextContent('App not found')
  })

  it('reports API health in the footer', async () => {
    mockApi({ ...tenancyRoutes, ...flagRoutes })
    renderApp('/')
    expect(await screen.findByText('API ok, database ok')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything())
  })

  it('reports when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Failed to fetch'))))
    renderApp('/')
    expect(await screen.findByText('API unreachable: Network error: Failed to fetch')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error: Failed to fetch')
  })

  it('shows a not-found page for unknown URLs', async () => {
    mockApi(tenancyRoutes)
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
