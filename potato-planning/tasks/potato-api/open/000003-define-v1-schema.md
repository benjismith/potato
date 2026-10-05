---
id: "000003"
title: Define the v1 schema and initial migration
type: task
status: open
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

- [ ] `src/db/schema.ts` defines all tables, columns, enums, primary keys (including composite PKs), unique constraints, indexes, and cascading foreign keys exactly as in DATA-MODEL.md.
- [ ] Drizzle relations are declared so relational queries (`db.query.*`) work.
- [ ] `npm run db:generate` produces a migration in `drizzle/`, and `npm run db:migrate` applies it cleanly to an empty `potato` database.
- [ ] `.env.example` documents `TEST_DATABASE_URL`, and the test helper migrates `potato_test` and truncates tables between tests.
- [ ] At least one integration test inserts and reads back a row through Drizzle against `potato_test`, and checks that a unique constraint is enforced (e.g. duplicate flag key within an app).
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.
