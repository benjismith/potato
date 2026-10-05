import type { App, Environment, Org, User } from '../api/types'

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
