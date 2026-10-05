// Current user, orgs, apps and environments (API.md, task 000005).
import { request, seg } from './client'
import type { App, Environment, Org, User } from './types'

export interface Me {
  user: User
  orgs: Org[]
}

export function getMe(): Promise<Me> {
  return request<Me>('GET', '/v1/me')
}

export async function listApps(orgId: string): Promise<App[]> {
  const body = await request<{ apps: App[] }>('GET', `/v1/orgs/${seg(orgId)}/apps`)
  return body.apps
}

export function createApp(
  orgId: string,
  input: { slug: string; name: string },
): Promise<{ app: App; environments: Environment[] }> {
  return request('POST', `/v1/orgs/${seg(orgId)}/apps`, input)
}

export async function getApp(appId: string): Promise<App> {
  const body = await request<{ app: App }>('GET', `/v1/apps/${seg(appId)}`)
  return body.app
}

/** Environments of an app, ordered by creation. */
export async function listEnvironments(appId: string): Promise<Environment[]> {
  const body = await request<{ environments: Environment[] }>(
    'GET',
    `/v1/apps/${seg(appId)}/environments`,
  )
  return body.environments
}

export async function createEnvironment(
  appId: string,
  input: { slug: string; name: string },
): Promise<Environment> {
  const body = await request<{ environment: Environment }>(
    'POST',
    `/v1/apps/${seg(appId)}/environments`,
    input,
  )
  return body.environment
}
