// Builders for the dashboard's URLs, so route shapes live in one place.

/** The URL params that identify an environment page. */
export interface EnvParams {
  orgId: string
  appId: string
  envSlug: string
}

const enc = encodeURIComponent

export function orgPath(orgId: string): string {
  return `/orgs/${enc(orgId)}`
}

export function appPath(orgId: string, appId: string): string {
  return `${orgPath(orgId)}/apps/${enc(appId)}`
}

export function envPath({ orgId, appId, envSlug }: EnvParams): string {
  return `${appPath(orgId, appId)}/envs/${enc(envSlug)}`
}

export function flagsPath(env: EnvParams): string {
  return `${envPath(env)}/flags`
}

export function newFlagPath(env: EnvParams): string {
  return `${flagsPath(env)}/new`
}

export function flagPath(env: EnvParams, flagId: string): string {
  return `${flagsPath(env)}/${enc(flagId)}`
}

/**
 * The same page as `pathname`, but in another environment. Everything after
 * the `/envs/:envSlug` segment (e.g. `/flags/flg_123`) is kept.
 */
export function switchEnvPath(pathname: string, env: EnvParams, newEnvSlug: string): string {
  const current = envPath(env)
  const rest = pathname.startsWith(current) ? pathname.slice(current.length) : '/flags'
  return envPath({ ...env, envSlug: newEnvSlug }) + rest
}
