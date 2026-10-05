import { useOutletContext } from 'react-router'
import type { App, Environment, Org } from './api/types'
import type { EnvParams } from './paths'

/** What every page under `/orgs/:orgId/apps/:appId/envs/:envSlug` gets. */
export interface EnvContext {
  params: EnvParams
  org: Org
  app: App
  environment: Environment
  environments: Environment[]
}

/** Read the current org/app/environment from inside an environment page. */
export function useEnv(): EnvContext {
  return useOutletContext<EnvContext>()
}
