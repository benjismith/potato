---
id: "000003"
title: Define the v1 schema and initial migration
type: task
status: done
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: []
epic: "000002"
---

# Define the v1 schema and initial migration

## Description

Implement every table in [DATA-MODEL.md](../../../docs/DATA-MODEL.md) as Drizzle definitions in `potato-api/src/db/schema.ts`, and generate the initial migration.

Also set up a database for integration tests (`potato_test`, via `TEST_DATABASE_URL`), with a Vitest helper that migrates it and truncates all tables between tests. Later API tasks use this harness for tests that hit MySQL.

## Acceptance criteria

- [x] `src/db/schema.ts` defines all tables, columns, enums, primary keys (including composite PKs), unique constraints, indexes, and cascading foreign keys exactly as in DATA-MODEL.md.
- [x] Drizzle relations are declared so relational queries (`db.query.*`) work.
- [x] `npm run db:generate` produces a migration in `drizzle/`, and `npm run db:migrate` applies it cleanly to an empty `potato` database.
- [x] `.env.example` documents `TEST_DATABASE_URL`, and the test helper migrates `potato_test` and truncates tables between tests.
- [x] At least one integration test inserts and reads back a row through Drizzle against `potato_test`, and checks that a unique constraint is enforced (e.g. duplicate flag key within an app).
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.

## Notes

Implementation choices not spelled out in DATA-MODEL.md (reported to the
coordinator for a doc update):

- **User references don't cascade.** `flags.created_by`, `signing_keys.created_by`,
  and `flag_configs.updated_by` use `ON DELETE NO ACTION` (restrict). Users
  aren't parents of the rows they create, and cascading would delete flags and
  keys along with a user. `org_members.user_id` still cascades.
- **Variation references do cascade**, as the doc says. RESTRICT would make
  InnoDB reject deleting a flag (it can cascade into `flag_variations` before
  `flag_configs`). "A referenced variation can't be deleted" must be enforced
  by the API.
- **Subject keys are case-sensitive** (`utf8mb4_bin` on `subjects.key` and
  `flag_targets.subject_key`), since they are opaque. The default collation is
  case- and accent-insensitive.
- **Extra non-unique indexes** on FK columns used for lookups:
  `flag_variations.flag_id`, `signing_keys.environment_id`,
  `flag_configs.environment_id`, `flag_targets.environment_id`.
- **UTC timestamps:** SQL defaults are `(utc_timestamp(3))`; `updated_at` is
  refreshed by Drizzle (`$onUpdate`), not `ON UPDATE CURRENT_TIMESTAMP`, which
  would use the session time zone.
