// Drizzle table definitions for the v1 data model. This file is normative
// only as an implementation of potato-planning/docs/DATA-MODEL.md; change that
// document first if the design changes.
//
// drizzle-kit reads this file to generate migrations (`npm run db:generate`)
// into ./drizzle.
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { newId, type IdPrefix } from "../ids.js";

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

/**
 * A prefixed-ULID primary key, e.g. `org_01J9Z…`. Drizzle generates one on
 * insert if the caller doesn't supply it.
 */
const idColumn = (prefix: IdPrefix) =>
  varchar("id", { length: 30 })
    .primaryKey()
    .$defaultFn(() => newId(prefix));

/** A foreign-key column holding a prefixed ULID. */
const ref = (name: string) => varchar(name, { length: 30 });

/**
 * A `datetime(3)` column, read and written as a JS `Date`. The mysql2 pool is
 * configured with `timezone: "Z"`, so values are stored in UTC.
 */
const datetime3 = (name: string) => datetime(name, { mode: "date", fsp: 3 });

/** `created_at`, defaulting to the current UTC time on the server. */
const createdAt = () =>
  datetime3("created_at")
    .notNull()
    .default(sql`(utc_timestamp(3))`);

/**
 * `updated_at`, defaulting to the current UTC time on insert, and refreshed by
 * Drizzle on every update. (MySQL's `ON UPDATE CURRENT_TIMESTAMP` would use the
 * session time zone rather than UTC.)
 */
const updatedAt = () =>
  datetime3("updated_at")
    .notNull()
    .default(sql`(utc_timestamp(3))`)
    .$onUpdate(() => new Date());

/**
 * A case- and accent-sensitive `varchar(255)`, for opaque developer-supplied
 * subject keys. The default collation (utf8mb4_0900_ai_ci) would treat
 * `"User1"` and `"user1"` as the same key.
 */
const opaqueKey = customType<{ data: string; driverData: string }>({
  dataType() {
    return "varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin";
  },
});

const cascade = { onDelete: "cascade" } as const;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const organizations = mysqlTable(
  "organizations",
  {
    id: idColumn("org"),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organizations_slug_unique").on(t.slug)],
);

export const users = mysqlTable(
  "users",
  {
    id: idColumn("usr"),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const orgRoles = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof orgRoles)[number];

export const orgMembers = mysqlTable(
  "org_members",
  {
    orgId: ref("org_id")
      .notNull()
      .references(() => organizations.id, cascade),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, cascade),
    role: mysqlEnum("role", orgRoles).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("org_members_user_id_idx").on(t.userId),
  ],
);

export const applications = mysqlTable(
  "applications",
  {
    id: idColumn("app"),
    orgId: ref("org_id")
      .notNull()
      .references(() => organizations.id, cascade),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("applications_org_id_slug_unique").on(t.orgId, t.slug)],
);

export const environments = mysqlTable(
  "environments",
  {
    id: idColumn("env"),
    applicationId: ref("application_id")
      .notNull()
      .references(() => applications.id, cascade),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("environments_application_id_slug_unique").on(
      t.applicationId,
      t.slug,
    ),
  ],
);

export const signingAlgorithms = ["ed25519"] as const;
export type SigningAlgorithm = (typeof signingAlgorithms)[number];

export const signingKeys = mysqlTable(
  "signing_keys",
  {
    id: idColumn("key"),
    environmentId: ref("environment_id")
      .notNull()
      .references(() => environments.id, cascade),
    label: varchar("label", { length: 255 }).notNull(),
    algorithm: mysqlEnum("algorithm", signingAlgorithms).notNull(),
    publicKeyPem: text("public_key_pem").notNull(),
    // Users aren't parents of the rows they create, so deleting a user must
    // not cascade away audit-relevant rows. Restrict instead.
    createdBy: ref("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    lastUsedAt: datetime3("last_used_at"),
    revokedAt: datetime3("revoked_at"),
  },
  (t) => [index("signing_keys_environment_id_idx").on(t.environmentId)],
);

export const flagTypes = ["boolean", "string", "number", "json"] as const;
export type FlagType = (typeof flagTypes)[number];

export const flags = mysqlTable(
  "flags",
  {
    id: idColumn("flg"),
    applicationId: ref("application_id")
      .notNull()
      .references(() => applications.id, cascade),
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    type: mysqlEnum("type", flagTypes).notNull(),
    createdBy: ref("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: datetime3("archived_at"),
  },
  (t) => [uniqueIndex("flags_application_id_key_unique").on(t.applicationId, t.key)],
);

export const flagVariations = mysqlTable(
  "flag_variations",
  {
    id: idColumn("var"),
    flagId: ref("flag_id")
      .notNull()
      .references(() => flags.id, cascade),
    name: varchar("name", { length: 255 }).notNull(),
    value: json("value").$type<unknown>().notNull(),
    sortOrder: int("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("flag_variations_flag_id_idx").on(t.flagId)],
);

// The variation references below cascade (as DATA-MODEL.md specifies) rather
// than restrict: with RESTRICT, InnoDB rejects deleting a flag, because it can
// cascade into flag_variations before flag_configs. "A referenced variation
// can't be deleted" is enforced by the API instead.
export const flagConfigs = mysqlTable(
  "flag_configs",
  {
    flagId: ref("flag_id")
      .notNull()
      .references(() => flags.id, cascade),
    environmentId: ref("environment_id")
      .notNull()
      .references(() => environments.id, cascade),
    enabled: boolean("enabled").notNull().default(false),
    offVariationId: ref("off_variation_id")
      .notNull()
      .references(() => flagVariations.id, cascade),
    defaultVariationId: ref("default_variation_id")
      .notNull()
      .references(() => flagVariations.id, cascade),
    version: int("version").notNull().default(1),
    updatedBy: ref("updated_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.flagId, t.environmentId] }),
    index("flag_configs_environment_id_idx").on(t.environmentId),
  ],
);

export const flagTargets = mysqlTable(
  "flag_targets",
  {
    flagId: ref("flag_id")
      .notNull()
      .references(() => flags.id, cascade),
    environmentId: ref("environment_id")
      .notNull()
      .references(() => environments.id, cascade),
    subjectKey: opaqueKey("subject_key").notNull(),
    variationId: ref("variation_id")
      .notNull()
      .references(() => flagVariations.id, cascade),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.flagId, t.environmentId, t.subjectKey] }),
    index("flag_targets_environment_id_idx").on(t.environmentId),
  ],
);

export const subjects = mysqlTable(
  "subjects",
  {
    environmentId: ref("environment_id")
      .notNull()
      .references(() => environments.id, cascade),
    key: opaqueKey("key").notNull(),
    attributes: json("attributes").$type<Record<string, unknown>>().notNull(),
    firstSeenAt: datetime3("first_seen_at").notNull(),
    lastSeenAt: datetime3("last_seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.environmentId, t.key] })],
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type OrgMember = typeof orgMembers.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Environment = typeof environments.$inferSelect;
export type SigningKey = typeof signingKeys.$inferSelect;
export type Flag = typeof flags.$inferSelect;
export type FlagVariation = typeof flagVariations.$inferSelect;
export type FlagConfig = typeof flagConfigs.$inferSelect;
export type FlagTarget = typeof flagTargets.$inferSelect;
export type Subject = typeof subjects.$inferSelect;

// ---------------------------------------------------------------------------
// Relations (for `db.query.*`)
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  applications: many(applications),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(orgMembers),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const applicationsRelations = relations(
  applications,
  ({ one, many }) => ({
    org: one(organizations, {
      fields: [applications.orgId],
      references: [organizations.id],
    }),
    environments: many(environments),
    flags: many(flags),
  }),
);

export const environmentsRelations = relations(
  environments,
  ({ one, many }) => ({
    application: one(applications, {
      fields: [environments.applicationId],
      references: [applications.id],
    }),
    signingKeys: many(signingKeys),
    flagConfigs: many(flagConfigs),
    flagTargets: many(flagTargets),
    subjects: many(subjects),
  }),
);

export const signingKeysRelations = relations(signingKeys, ({ one }) => ({
  environment: one(environments, {
    fields: [signingKeys.environmentId],
    references: [environments.id],
  }),
  creator: one(users, {
    fields: [signingKeys.createdBy],
    references: [users.id],
  }),
}));

export const flagsRelations = relations(flags, ({ one, many }) => ({
  application: one(applications, {
    fields: [flags.applicationId],
    references: [applications.id],
  }),
  creator: one(users, { fields: [flags.createdBy], references: [users.id] }),
  variations: many(flagVariations),
  configs: many(flagConfigs),
  targets: many(flagTargets),
}));

export const flagVariationsRelations = relations(flagVariations, ({ one }) => ({
  flag: one(flags, {
    fields: [flagVariations.flagId],
    references: [flags.id],
  }),
}));

export const flagConfigsRelations = relations(flagConfigs, ({ one }) => ({
  flag: one(flags, { fields: [flagConfigs.flagId], references: [flags.id] }),
  environment: one(environments, {
    fields: [flagConfigs.environmentId],
    references: [environments.id],
  }),
  offVariation: one(flagVariations, {
    fields: [flagConfigs.offVariationId],
    references: [flagVariations.id],
    relationName: "offVariation",
  }),
  defaultVariation: one(flagVariations, {
    fields: [flagConfigs.defaultVariationId],
    references: [flagVariations.id],
    relationName: "defaultVariation",
  }),
  updater: one(users, {
    fields: [flagConfigs.updatedBy],
    references: [users.id],
  }),
}));

export const flagTargetsRelations = relations(flagTargets, ({ one }) => ({
  flag: one(flags, { fields: [flagTargets.flagId], references: [flags.id] }),
  environment: one(environments, {
    fields: [flagTargets.environmentId],
    references: [environments.id],
  }),
  variation: one(flagVariations, {
    fields: [flagTargets.variationId],
    references: [flagVariations.id],
  }),
}));

export const subjectsRelations = relations(subjects, ({ one }) => ({
  environment: one(environments, {
    fields: [subjects.environmentId],
    references: [environments.id],
  }),
}));
