// Resource shapes from the management API contract
// (potato-planning/docs/API.md).

export interface User {
  id: string
  email: string
  name: string
}

export interface Org {
  id: string
  slug: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

export interface App {
  id: string
  orgId: string
  slug: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Environment {
  id: string
  applicationId: string
  slug: string
  name: string
  createdAt: string
  updatedAt: string
}

export type FlagType = 'boolean' | 'string' | 'number' | 'json'

export interface Variation {
  id: string
  name: string
  value: unknown
  sortOrder: number
}

export interface FlagConfig {
  environmentId: string
  enabled: boolean
  offVariationId: string
  defaultVariationId: string
  version: number
  updatedAt: string
  updatedBy: string
}

export interface Target {
  subjectKey: string
  variationId: string
  createdAt: string
}

export type FlagConfigDetail = FlagConfig & { targets: Target[] }

export interface Flag {
  id: string
  applicationId: string
  key: string
  name: string
  description: string | null
  type: FlagType
  /** Sorted by sortOrder. */
  variations: Variation[]
  /** Keyed by environment ID, one per environment. */
  configs: Record<string, FlagConfig>
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type FlagDetail = Omit<Flag, 'configs'> & {
  configs: Record<string, FlagConfigDetail>
}
