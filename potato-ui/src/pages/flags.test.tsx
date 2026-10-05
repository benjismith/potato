import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlagConfigDetail, FlagDetail } from '../api/types'
import { booleanFlag, development, devFlagsPath, tenancyRoutes } from '../test/fixtures'
import { mockApi, sentBodies } from '../test/mockApi'
import { renderApp } from '../test/render'

const devConfigPath = '/v1/flags/flg_1/environments/env_dev'

function location() {
  return screen.getByTestId('location').textContent
}

function conflict() {
  return Response.json(
    { error: 'version_conflict', message: 'Stale version', details: { currentVersion: 2 } },
    { status: 409 },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('flag list', () => {
  it('lists flags with their state in the current environment', async () => {
    const flag = booleanFlag()
    flag.configs[development.id].enabled = true
    mockApi({ ...tenancyRoutes, 'GET /v1/apps/app_1/flags': { flags: [flag] } })
    renderApp(devFlagsPath)

    const row = (await screen.findByRole('link', { name: 'new-checkout' })).closest('tr')!
    const servingCell = row.querySelectorAll('td')[4]
    expect(within(row).getByText('New checkout')).toBeInTheDocument()
    expect(within(row).getByText('boolean')).toBeInTheDocument()
    expect(within(row).getByRole('switch', { name: 'Enable new-checkout' })).toBeChecked()
    expect(servingCell).toHaveTextContent('On true')
  })

  it('toggles optimistically and saves with the config version', async () => {
    const flag = booleanFlag()
    let finishSave: (res: Response) => void = () => {}
    const fetchMock = mockApi({
      ...tenancyRoutes,
      'GET /v1/apps/app_1/flags': { flags: [flag] },
      [`PATCH ${devConfigPath}`]: () => new Promise<Response>((resolve) => (finishSave = resolve)),
    })
    renderApp(devFlagsPath)

    const toggle = await screen.findByRole('switch', { name: 'Enable new-checkout' })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)

    // On immediately, before the API has answered.
    expect(toggle).toBeChecked()
    expect(sentBodies(fetchMock, `PATCH ${devConfigPath}`)).toEqual([{ version: 1, enabled: true }])

    const saved: FlagConfigDetail = { ...flag.configs[development.id], enabled: true, version: 2 }
    finishSave(Response.json({ config: saved }))
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toBeChecked()

    // The next write sends the new version.
    mockApi({ ...tenancyRoutes, [`PATCH ${devConfigPath}`]: { config: { ...saved, enabled: false, version: 3 } } })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(sentBodies(vi.mocked(fetch), `PATCH ${devConfigPath}`)).toEqual([{ version: 2, enabled: false }])
  })

  it('rolls back a toggle when the API fails', async () => {
    mockApi({
      ...tenancyRoutes,
      'GET /v1/apps/app_1/flags': { flags: [booleanFlag()] },
      [`PATCH ${devConfigPath}`]: () => Response.json({ error: 'boom', message: 'Database down' }, { status: 500 }),
    })
    renderApp(devFlagsPath)

    const toggle = await screen.findByRole('switch', { name: 'Enable new-checkout' })
    await userEvent.click(toggle)

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t update "new-checkout": Database down')
    expect(toggle).not.toBeChecked()
  })

  it('on a 409, rolls back, explains the conflict and refreshes', async () => {
    const stale = booleanFlag()
    const fresh = booleanFlag({ name: 'New checkout (renamed)' })
    fresh.configs[development.id] = { ...fresh.configs[development.id], version: 2 }
    let listCalls = 0
    mockApi({
      ...tenancyRoutes,
      'GET /v1/apps/app_1/flags': () => Response.json({ flags: [listCalls++ === 0 ? stale : fresh] }),
      [`PATCH ${devConfigPath}`]: conflict,
    })
    renderApp(devFlagsPath)

    const toggle = await screen.findByRole('switch', { name: 'Enable new-checkout' })
    await userEvent.click(toggle)

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed "new-checkout"')
    expect(await screen.findByText('New checkout (renamed)')).toBeInTheDocument()
    expect(listCalls).toBe(2)
    expect(screen.getByRole('switch', { name: 'Enable new-checkout' })).not.toBeChecked()
  })
})

describe('create flag', () => {
  it('validates the key, then creates a boolean flag and opens it', async () => {
    const created = booleanFlag({ id: 'flg_new', key: 'dark-mode', name: 'Dark mode' })
    const fetchMock = mockApi({
      ...tenancyRoutes,
      'GET /v1/apps/app_1/flags': { flags: [] },
      'POST /v1/apps/app_1/flags': () => Response.json({ flag: created }, { status: 201 }),
      'GET /v1/flags/flg_new': { flag: created },
    })
    renderApp(devFlagsPath)

    await userEvent.click(await screen.findByRole('link', { name: 'New flag' }))
    const key = screen.getByLabelText('Key')

    await userEvent.type(key, 'Dark Mode')
    await userEvent.type(screen.getByLabelText('Name'), 'Dark mode')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))
    expect(screen.getByText(/Use lowercase letters, digits/)).toBeInTheDocument()
    expect(key).toHaveAttribute('aria-invalid', 'true')
    expect(sentBodies(fetchMock, 'POST /v1/apps/app_1/flags')).toEqual([])

    await userEvent.clear(key)
    await userEvent.type(key, 'dark-mode')
    expect(key).not.toHaveAttribute('aria-invalid')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))

    expect(await screen.findByRole('heading', { name: 'dark-mode' })).toBeInTheDocument()
    expect(location()).toBe('/orgs/org_1/apps/app_1/envs/development/flags/flg_new')
    expect(sentBodies(fetchMock, 'POST /v1/apps/app_1/flags')).toEqual([
      { key: 'dark-mode', name: 'Dark mode', type: 'boolean' },
    ])
  })

  it('sends parsed variations for non-boolean flags', async () => {
    const fetchMock = mockApi({
      ...tenancyRoutes,
      'POST /v1/apps/app_1/flags': () => Response.json({ flag: booleanFlag({ id: 'flg_x' }) }, { status: 201 }),
      'GET /v1/flags/flg_x': { flag: booleanFlag({ id: 'flg_x' }) },
    })
    renderApp(`${devFlagsPath}/new`)

    await userEvent.type(await screen.findByLabelText('Key'), 'page-size')
    await userEvent.type(screen.getByLabelText('Name'), 'Page size')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'number')
    await userEvent.type(screen.getByLabelText('Variation 1 name'), 'Large')
    await userEvent.type(screen.getByLabelText('Variation 1 value'), 'fifty')
    await userEvent.type(screen.getByLabelText('Variation 2 name'), 'Small')
    await userEvent.type(screen.getByLabelText('Variation 2 value'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Variation 1: Must be a number.')

    await userEvent.clear(screen.getByLabelText('Variation 1 value'))
    await userEvent.type(screen.getByLabelText('Variation 1 value'), '50')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))

    await waitFor(() => expect(location()).toBe('/orgs/org_1/apps/app_1/envs/development/flags/flg_x'))
    expect(sentBodies(fetchMock, 'POST /v1/apps/app_1/flags')).toEqual([
      {
        key: 'page-size',
        name: 'Page size',
        type: 'number',
        variations: [
          { name: 'Large', value: 50 },
          { name: 'Small', value: 10 },
        ],
      },
    ])
  })

  it('explains a duplicate key', async () => {
    mockApi({
      ...tenancyRoutes,
      'POST /v1/apps/app_1/flags': () =>
        Response.json({ error: 'conflict', message: 'Duplicate key' }, { status: 409 }),
    })
    renderApp(`${devFlagsPath}/new`)

    await userEvent.type(await screen.findByLabelText('Key'), 'new-checkout')
    await userEvent.type(screen.getByLabelText('Name'), 'New checkout')
    await userEvent.click(screen.getByRole('button', { name: 'Create flag' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A flag with the key "new-checkout" already exists in Demo App.',
    )
  })
})

describe('flag detail', () => {
  const detailPath = `${devFlagsPath}/flg_1`

  it('changes the served variation with the config version, and handles a 409', async () => {
    let flag: FlagDetail = booleanFlag()
    let patchCalls = 0
    const fetchMock = mockApi({
      ...tenancyRoutes,
      'GET /v1/flags/flg_1': () => Response.json({ flag }),
      [`PATCH ${devConfigPath}`]: () => {
        patchCalls++
        if (patchCalls === 1) {
          const config = { ...flag.configs[development.id], offVariationId: 'flg_1_on', version: 2 }
          return Response.json({ config })
        }
        // Someone else bumped the version meanwhile.
        flag = booleanFlag()
        flag.configs[development.id] = { ...flag.configs[development.id], enabled: true, version: 5 }
        return conflict()
      },
    })
    renderApp(detailPath)

    const offSelect = await screen.findByLabelText('Serve when off')
    await userEvent.selectOptions(offSelect, 'flg_1_on')
    await waitFor(() => expect(screen.getByText('Version 2')).toBeInTheDocument())
    expect(offSelect).toHaveValue('flg_1_on')

    await userEvent.click(screen.getByRole('switch', { name: 'Enable new-checkout' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed "new-checkout"')
    expect(await screen.findByText('Version 5')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Enable new-checkout' })).toBeChecked()

    expect(sentBodies(fetchMock, `PATCH ${devConfigPath}`)).toEqual([
      { version: 1, offVariationId: 'flg_1_on' },
      { version: 2, enabled: true },
    ])
  })

  it('archives with an inline confirmation, and unarchives', async () => {
    const archived = booleanFlag({ archivedAt: '2026-10-05T13:00:00.000Z' })
    const fetchMock = mockApi({
      ...tenancyRoutes,
      'GET /v1/flags/flg_1': { flag: booleanFlag() },
      'POST /v1/flags/flg_1/archive': { flag: archived },
      'POST /v1/flags/flg_1/unarchive': { flag: booleanFlag() },
    })
    renderApp(detailPath)

    await userEvent.click(await screen.findByRole('button', { name: 'Archive flag' }))
    expect(sentBodies(fetchMock, 'POST /v1/flags/flg_1/archive')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Yes, archive it' }))

    expect(await screen.findByText('archived')).toBeInTheDocument()
    expect(sentBodies(fetchMock, 'POST /v1/flags/flg_1/archive')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Unarchive flag' }))
    await waitFor(() => expect(screen.queryByText('archived')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Archive flag' })).toBeInTheDocument()
  })

  it('saves name and description', async () => {
    const fetchMock = mockApi({
      ...tenancyRoutes,
      'GET /v1/flags/flg_1': { flag: booleanFlag() },
      'PATCH /v1/flags/flg_1': { flag: booleanFlag({ name: 'Checkout v2', description: 'Rollout' }) },
    })
    renderApp(detailPath)

    const name = await screen.findByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Checkout v2')
    await userEvent.type(screen.getByLabelText('Description'), 'Rollout')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(sentBodies(fetchMock, 'PATCH /v1/flags/flg_1')).toEqual([{ name: 'Checkout v2', description: 'Rollout' }])
  })

  it('keeps the same flag when switching environments', async () => {
    mockApi({ ...tenancyRoutes, 'GET /v1/flags/flg_1': { flag: booleanFlag() } })
    renderApp(detailPath)

    await screen.findByRole('heading', { name: 'In Development' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Environment' }), 'production')

    expect(await screen.findByRole('heading', { name: 'In Production' })).toBeInTheDocument()
    expect(location()).toBe('/orgs/org_1/apps/app_1/envs/production/flags/flg_1')
  })
})
