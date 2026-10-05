// Flags and per-environment flag configs (API.md, task 000006).
import { request, seg } from './client'
import type { Flag, FlagConfigDetail, FlagDetail, FlagType } from './types'

/** Flag keys (and slugs) must match this, per DATA-MODEL.md. */
export const FLAG_KEY_PATTERN = /^[a-z0-9][a-z0-9-_.]{0,63}$/

/** Flags of an app, ordered by key. Archived flags only if `archived` is true. */
export async function listFlags(appId: string, options: { archived?: boolean } = {}): Promise<Flag[]> {
  const query = options.archived ? '?archived=true' : ''
  const body = await request<{ flags: Flag[] }>('GET', `/v1/apps/${seg(appId)}/flags${query}`)
  return body.flags
}

export interface NewFlag {
  key: string
  name: string
  description?: string
  type: FlagType
  /** Omit for boolean flags; at least two for every other type. */
  variations?: { name: string; value: unknown }[]
}

export async function createFlag(appId: string, input: NewFlag): Promise<FlagDetail> {
  const body = await request<{ flag: FlagDetail }>('POST', `/v1/apps/${seg(appId)}/flags`, input)
  return body.flag
}

export async function getFlag(flagId: string): Promise<FlagDetail> {
  const body = await request<{ flag: FlagDetail }>('GET', `/v1/flags/${seg(flagId)}`)
  return body.flag
}

export async function updateFlag(
  flagId: string,
  changes: { name?: string; description?: string | null },
): Promise<FlagDetail> {
  const body = await request<{ flag: FlagDetail }>('PATCH', `/v1/flags/${seg(flagId)}`, changes)
  return body.flag
}

export async function archiveFlag(flagId: string): Promise<FlagDetail> {
  const body = await request<{ flag: FlagDetail }>('POST', `/v1/flags/${seg(flagId)}/archive`)
  return body.flag
}

export async function unarchiveFlag(flagId: string): Promise<FlagDetail> {
  const body = await request<{ flag: FlagDetail }>('POST', `/v1/flags/${seg(flagId)}/unarchive`)
  return body.flag
}

export interface ConfigChanges {
  /** The config version this change is based on. A stale one gets 409. */
  version: number
  enabled?: boolean
  offVariationId?: string
  defaultVariationId?: string
}

export async function updateFlagConfig(
  flagId: string,
  environmentId: string,
  changes: ConfigChanges,
): Promise<FlagConfigDetail> {
  const body = await request<{ config: FlagConfigDetail }>(
    'PATCH',
    `/v1/flags/${seg(flagId)}/environments/${seg(environmentId)}`,
    changes,
  )
  return body.config
}
