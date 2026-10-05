// Row → API resource shapes (API.md). Dates serialize to ISO-8601 UTC strings
// via Date#toJSON when the response is JSON-encoded.
import type {
  Application,
  Environment,
  Flag,
  FlagConfig,
  FlagTarget,
  FlagVariation,
  Organization,
  OrgMember,
  User,
} from "../db/schema.js";

export const toUser = (u: User) => ({ id: u.id, email: u.email, name: u.name });

export const toOrg = (o: Organization, role: OrgMember["role"]) => ({
  id: o.id,
  slug: o.slug,
  name: o.name,
  role,
});

export const toApp = (a: Application) => ({
  id: a.id,
  orgId: a.orgId,
  slug: a.slug,
  name: a.name,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

export const toEnvironment = (e: Environment) => ({
  id: e.id,
  applicationId: e.applicationId,
  slug: e.slug,
  name: e.name,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

export const toVariation = (v: FlagVariation) => ({
  id: v.id,
  name: v.name,
  value: v.value,
  sortOrder: v.sortOrder,
});

export const toFlagConfig = (c: FlagConfig) => ({
  environmentId: c.environmentId,
  enabled: c.enabled,
  offVariationId: c.offVariationId,
  defaultVariationId: c.defaultVariationId,
  version: c.version,
  updatedAt: c.updatedAt,
  updatedBy: c.updatedBy,
});

export const toTarget = (t: FlagTarget) => ({
  subjectKey: t.subjectKey,
  variationId: t.variationId,
  createdAt: t.createdAt,
});

/** A config with its targets (sorted by subject key). */
export const toFlagConfigWithTargets = (c: FlagConfig, targets: FlagTarget[]) => ({
  ...toFlagConfig(c),
  targets: targets
    .filter((t) => t.flagId === c.flagId && t.environmentId === c.environmentId)
    .sort((a, b) => (a.subjectKey < b.subjectKey ? -1 : a.subjectKey > b.subjectKey ? 1 : 0))
    .map(toTarget),
});

const sortVariations = (vs: FlagVariation[]) =>
  [...vs].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1)).map(toVariation);

const flagFields = (f: Flag) => ({
  id: f.id,
  applicationId: f.applicationId,
  key: f.key,
  name: f.name,
  description: f.description,
  type: f.type,
});

/** API.md `Flag`: variations plus a config per environment (no targets). */
export const toFlag = (f: Flag & { variations: FlagVariation[]; configs: FlagConfig[] }) => ({
  ...flagFields(f),
  variations: sortVariations(f.variations),
  configs: Object.fromEntries(f.configs.map((c) => [c.environmentId, toFlagConfig(c)])),
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
  archivedAt: f.archivedAt,
});

/** API.md `FlagDetail`: `Flag`, with each config's targets. */
export const toFlagDetail = (
  f: Flag & { variations: FlagVariation[]; configs: FlagConfig[]; targets: FlagTarget[] },
) => ({
  ...flagFields(f),
  variations: sortVariations(f.variations),
  configs: Object.fromEntries(
    f.configs.map((c) => [c.environmentId, toFlagConfigWithTargets(c, f.targets)]),
  ),
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
  archivedAt: f.archivedAt,
});
