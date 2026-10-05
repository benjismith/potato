# Data model

Potato is a self-hosted, multi-tenant feature-flag service (a LaunchDarkly
clone). This document defines the v1 relational model, which lives in MySQL and
is implemented with Drizzle in `potato-api/src/db/schema.ts`.

## Vocabulary

| Term            | Meaning |
|-----------------|---------|
| **user**        | A first-party person who logs into the Potato dashboard and manages flags. |
| **subject**     | A third-party end user of a customer's application: the entity flags are evaluated *for*. Identified by an opaque, developer-supplied `key`. |
| **organization** (org) | The tenant boundary. Owns applications. Users belong to orgs. |
| **application** (app)  | A product being developed by an org. Owns flags and environments. |
| **environment** (env)  | A deployment stage of an app (e.g. `development`, `production`). Flag *state* is per environment. |
| **flag**        | A named switch, identified by a `key` that is unique within its app. Its *definition* is shared across environments. |
| **variation**   | One possible value a flag can serve (e.g. `true`/`false`, `"blue"`/`"green"`). |
| **flag config** | A flag's per-environment state: on/off, which variation to serve when off, which to serve by default when on. |
| **target**      | A per-environment rule that forces a specific subject to a specific variation. |
| **signing key** | An Ed25519 public key registered against an environment, used to verify signed SDK requests. See [SIGNING.md](SIGNING.md). |

Never use the bare word "developer" in code or schema. Use **user** for
first-party people and **subject** for third-party end users.

## Entity relationships

```
organizations ──< org_members >── users
      │
      └──< applications ──< environments ──< signing_keys
                 │               │
                 │               └──< subjects
                 │
                 └──< flags ──< flag_variations
                        │
                        └──< flag_configs   (exactly one per flag × environment)
                                  │
                                  └──< flag_targets  (subject_key → variation)
```

## Conventions

- **IDs** are prefixed ULIDs stored as `varchar(30)`, e.g. `org_01J9Z…`. The
  prefix makes IDs self-describing in logs and URLs, and ULIDs are
  non-sequential, so tenants can't enumerate each other's resources. Prefixes:

  | Table             | Prefix |
  |-------------------|--------|
  | `organizations`   | `org_` |
  | `users`           | `usr_` |
  | `applications`    | `app_` |
  | `environments`    | `env_` |
  | `signing_keys`    | `key_` |
  | `flags`           | `flg_` |
  | `flag_variations` | `var_` |

  Tables keyed by a natural composite key (`org_members`, `flag_configs`,
  `flag_targets`, `subjects`) have no surrogate ID.
- **Slugs/keys** (`organizations.slug`, `applications.slug`,
  `environments.slug`, `flags.key`) match `^[a-z0-9][a-z0-9-_.]{0,63}$` and are
  immutable once created, because SDK callers and URLs depend on them.
- **Timestamps:** every table has `created_at`, and mutable tables have
  `updated_at`, both `datetime(3)` in UTC.
- **Soft deletion:** flags are archived (`archived_at`), and signing keys are
  revoked (`revoked_at`). Both stay in place for audit, and are excluded from
  evaluation and verification.
- **Foreign keys** are declared with `ON DELETE CASCADE` from child to parent.
  v1 exposes no hard deletes for orgs, apps, or environments.
- **Tenant isolation:** every management query is scoped through the
  org → application chain, and must verify the current user is a member of the
  org. Every SDK request is scoped by the signing key, which determines the
  environment (and therefore the app and org). An SDK request can never name a
  different tenant's resources.

## Tables

### `organizations`

| Column       | Type          | Notes |
|--------------|---------------|-------|
| `id`         | varchar(30) PK | `org_…` |
| `slug`       | varchar(64)   | Unique. |
| `name`       | varchar(255)  | |
| `created_at`, `updated_at` | datetime(3) | |

### `users`

| Column       | Type          | Notes |
|--------------|---------------|-------|
| `id`         | varchar(30) PK | `usr_…` |
| `email`      | varchar(255)  | Unique. Not verified in v1. |
| `name`       | varchar(255)  | |
| `created_at`, `updated_at` | datetime(3) | |

v1 has no passwords or sessions. The API uses a stubbed **current user** (see
below), so there is no `password_hash` column yet.

### `org_members`

| Column       | Type          | Notes |
|--------------|---------------|-------|
| `org_id`     | FK → organizations | PK part 1. |
| `user_id`    | FK → users    | PK part 2. Indexed for "my orgs" lookups. |
| `role`       | enum(`owner`, `admin`, `member`) | Recorded but not enforced in v1, where membership alone grants access. |
| `created_at` | datetime(3)   | |

### `applications`

| Column       | Type          | Notes |
|--------------|---------------|-------|
| `id`         | varchar(30) PK | `app_…` |
| `org_id`     | FK → organizations | |
| `slug`       | varchar(64)   | Unique per `(org_id, slug)`. |
| `name`       | varchar(255)  | |
| `created_at`, `updated_at` | datetime(3) | |

### `environments`

| Column           | Type          | Notes |
|------------------|---------------|-------|
| `id`             | varchar(30) PK | `env_…` |
| `application_id` | FK → applications | |
| `slug`           | varchar(64)   | Unique per `(application_id, slug)`. |
| `name`           | varchar(255)  | |
| `created_at`, `updated_at` | datetime(3) | |

A new application is created with two environments, `development` and
`production`.

### `signing_keys`

| Column           | Type          | Notes |
|------------------|---------------|-------|
| `id`             | varchar(30) PK | `key_…`. This is the **key ID** sent in `X-Potato-Key-Id`. |
| `environment_id` | FK → environments | |
| `label`          | varchar(255)  | Human-readable, e.g. "prod web servers". |
| `algorithm`      | enum(`ed25519`) | Only Ed25519 in v1. |
| `public_key_pem` | text          | SPKI PEM. Validated on insert (must parse as an Ed25519 public key). |
| `created_by`     | FK → users    | |
| `created_at`     | datetime(3)   | |
| `last_used_at`   | datetime(3) null | Updated on successful verification (throttled). |
| `revoked_at`     | datetime(3) null | Revoked keys never verify. |

An environment can have several active keys at once, so keys can be rotated
without downtime. Private keys are **never** sent to or stored by Potato.

### `flags`

| Column           | Type          | Notes |
|------------------|---------------|-------|
| `id`             | varchar(30) PK | `flg_…` |
| `application_id` | FK → applications | |
| `key`            | varchar(64)   | Unique per `(application_id, key)`. This is what the SDK sees. |
| `name`           | varchar(255)  | |
| `description`    | text null     | |
| `type`           | enum(`boolean`, `string`, `number`, `json`) | All variations must match this type. |
| `created_by`     | FK → users    | |
| `created_at`, `updated_at` | datetime(3) | |
| `archived_at`    | datetime(3) null | Archived flags are not evaluated. |

### `flag_variations`

| Column       | Type          | Notes |
|--------------|---------------|-------|
| `id`         | varchar(30) PK | `var_…` |
| `flag_id`    | FK → flags    | |
| `name`       | varchar(255)  | e.g. "On", "Off", "Blue". |
| `value`      | json          | Must match `flags.type`. |
| `sort_order` | int           | Display order. |
| `created_at`, `updated_at` | datetime(3) | |

A flag has at least two variations. A `boolean` flag has exactly two, `true`
and `false`, created automatically. Variations are referenced by ID, never by
position, so reordering or editing them can't re-point configs or targets. A
variation that is referenced by any config or target can't be deleted.

### `flag_configs`

| Column                 | Type          | Notes |
|------------------------|---------------|-------|
| `flag_id`              | FK → flags    | PK part 1. |
| `environment_id`       | FK → environments | PK part 2. |
| `enabled`              | boolean       | Defaults to `false`. |
| `off_variation_id`     | FK → flag_variations | Served when `enabled = false`. |
| `default_variation_id` | FK → flag_variations | Served when `enabled = true` and the subject has no target. |
| `version`              | int           | Starts at 1, and increments on every change to this config or its targets. |
| `updated_by`           | FK → users    | |
| `created_at`, `updated_at` | datetime(3) | |

**Invariant:** every (flag, environment) pair in the same application has
exactly one config row. Creating a flag creates a config in every environment
of its app, and creating an environment creates a config for every flag.
Defaults for boolean flags: `enabled = false`, off → `false`, default → `true`.

The management API uses `version` for optimistic concurrency: updates must
supply the version they read, and stale writes get `409 Conflict`.

### `flag_targets`

| Column           | Type          | Notes |
|------------------|---------------|-------|
| `flag_id`        | FK → flags    | PK part 1. |
| `environment_id` | FK → environments | PK part 2. |
| `subject_key`    | varchar(255)  | PK part 3. Need not exist in `subjects`. |
| `variation_id`   | FK → flag_variations | |
| `created_at`     | datetime(3)   | |

Targets are keyed by subject **key**, not by a foreign key to `subjects`, so a
developer can target a subject before Potato has ever seen it.

### `subjects`

| Column           | Type          | Notes |
|------------------|---------------|-------|
| `environment_id` | FK → environments | PK part 1. |
| `key`            | varchar(255)  | PK part 2. Opaque, developer-supplied. |
| `attributes`     | json          | Last attributes seen (unused by v1 evaluation). |
| `first_seen_at`  | datetime(3)   | |
| `last_seen_at`   | datetime(3)   | |

Subjects are **not** registered ahead of time. The evaluation endpoint upserts
a row for each subject it evaluates. This table only gives the dashboard
visibility (e.g. autocomplete when adding targets). Evaluation never depends
on it.

## Evaluation (v1)

Given a signed request carrying a subject, the API resolves the environment
from the signing key, then for each non-archived flag in that environment's
application:

1. If the config has `enabled = false`, serve `off_variation_id`.
2. Else, if a `flag_targets` row exists for `(flag, environment, subject.key)`,
   serve its `variation_id`.
3. Else, serve `default_variation_id`.

The response maps flag keys to variation **values**:

```json
{ "flags": { "new-checkout": true, "banner-color": "blue" } }
```

Attribute-based rules and percentage rollouts are out of scope for v1. When
they arrive, they slot in between steps 2 and 3.

## Current-user stub (v1)

There is no login. The seed script creates one user, one org with that user as
`owner`, and one app with `development` and `production` environments. The API
treats a configured user (`POTATO_CURRENT_USER_ID`, defaulting to the seeded
user) as the authenticated user for every management request. All membership
checks still run against that user, so swapping in real authentication later
only replaces how the current user is resolved.

## API surfaces

| Surface        | Path prefix | Auth | Consumer |
|----------------|-------------|------|----------|
| Management API | `/v1/…`     | Current user (stubbed) | `potato-ui` dashboard |
| SDK API        | `/sdk/v1/…` | Signed requests ([SIGNING.md](SIGNING.md)) | `potato-sdk` |
