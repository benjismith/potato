import type { App, Environment, FlagDetail, Org, User } from '../api/types'

const at = '2026-10-05T12:00:00.000Z'

export const user: User = { id: 'usr_1', email: 'potato@example.com', name: 'Potato User' }

export const org: Org = { id: 'org_1', slug: 'default', name: 'Default Org', role: 'owner' }
export const otherOrg: Org = { id: 'org_2', slug: 'other', name: 'Other Org', role: 'member' }

export const app: App = { id: 'app_1', orgId: org.id, slug: 'demo', name: 'Demo App', createdAt: at, updatedAt: at }

export const development: Environment = {
  id: 'env_dev',
  applicationId: app.id,
  slug: 'development',
  name: 'Development',
  createdAt: at,
  updatedAt: at,
}

export const production: Environment = {
  id: 'env_prd',
  applicationId: app.id,
  slug: 'production',
  name: 'Production',
  createdAt: at,
  updatedAt: at,
}

/** Mock routes for the tenancy endpoints, matching the fixtures above. */
export const tenancyRoutes = {
  'GET /v1/me': { user, orgs: [org, otherOrg] },
  'GET /v1/orgs/org_1/apps': { apps: [app] },
  'GET /v1/apps/app_1': { app },
  'GET /v1/apps/app_1/environments': { environments: [development, production] },
}

export const devFlagsPath = '/orgs/org_1/apps/app_1/envs/development/flags'

/** A boolean flag with configs in both environments (off, version 1). */
export function booleanFlag(overrides: Partial<FlagDetail> = {}): FlagDetail {
  const id = overrides.id ?? 'flg_1'
  const config = (environmentId: string) => ({
    environmentId,
    enabled: false,
    offVariationId: `${id}_off`,
    defaultVariationId: `${id}_on`,
    version: 1,
    updatedAt: at,
    updatedBy: user.id,
    targets: [],
  })
  return {
    id,
    applicationId: app.id,
    key: 'new-checkout',
    name: 'New checkout',
    description: null,
    type: 'boolean',
    variations: [
      { id: `${id}_on`, name: 'On', value: true, sortOrder: 0 },
      { id: `${id}_off`, name: 'Off', value: false, sortOrder: 1 },
    ],
    configs: { [development.id]: config(development.id), [production.id]: config(production.id) },
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    ...overrides,
  }
}
