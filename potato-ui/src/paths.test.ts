import { describe, expect, it } from 'vitest'
import { switchEnvPath } from './paths'

const env = { orgId: 'org_1', appId: 'app_1', envSlug: 'development' }

describe('switchEnvPath', () => {
  it('keeps everything after the environment segment', () => {
    expect(switchEnvPath('/orgs/org_1/apps/app_1/envs/development/flags/flg_9', env, 'production')).toBe(
      '/orgs/org_1/apps/app_1/envs/production/flags/flg_9',
    )
  })

  it('falls back to the flags page for an unexpected path', () => {
    expect(switchEnvPath('/elsewhere', env, 'production')).toBe('/orgs/org_1/apps/app_1/envs/production/flags')
  })
})
