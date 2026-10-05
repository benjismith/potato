# potato-api

The Potato REST API: TypeScript on Node.js, using [Hono](https://hono.dev/)
for HTTP routing and [Drizzle ORM](https://orm.drizzle.team/) with MySQL.

## Prerequisites

- Node.js 22.9+ (uses `--env-file-if-exists`)
- A MySQL server running locally, with a `potato` database:

  ```sh
  mysql -u root -e "CREATE DATABASE IF NOT EXISTS potato"
  ```

## Setup

```sh
npm install
cp .env.example .env   # then adjust DATABASE_URL if needed
npm run db:migrate
npm run db:seed
npm run dev
```

Then check `http://localhost:3000/health`.

## Environment variables

| Variable       | Default | Description |
|----------------|---------|-------------|
| `PORT`         | `3000`  | Port the HTTP server listens on. |
| `DATABASE_URL` | none    | MySQL connection string, e.g. `mysql://root@localhost:3306/potato`. Required. |
| `POTATO_CURRENT_USER_ID` | seeded user | The user every management request is authenticated as (v1 has no login). Defaults to `usr_0000000000000000000000SEED`, created by `npm run db:seed`. |
| `TEST_DATABASE_URL` | none | MySQL database for integration tests, e.g. `mysql://root@localhost:3306/potato_test`. Required by `npm test`. Its name must end in `_test`. |

Variables are read from `.env` (git-ignored) if present. Real environment
variables take precedence over `.env`.

## Scripts

| Script                | Description |
|-----------------------|-------------|
| `npm run dev`         | Start the API with `tsx` in watch mode. |
| `npm run build`       | Compile `src/` to `dist/` with `tsc`. |
| `npm start`           | Run the compiled API from `dist/`. |
| `npm run typecheck`   | Type-check sources, tests, and config without emitting. |
| `npm test`            | Run the Vitest suite once (`npm run test:watch` to watch). |
| `npm run db:generate` | Generate SQL migrations in `drizzle/` from `src/db/schema.ts`. |
| `npm run db:migrate`  | Apply pending migrations to `DATABASE_URL`. |
| `npm run db:seed`     | Create the seed user, org, app, and environments if missing (idempotent). |
| `npm run db:studio`   | Open Drizzle Studio to browse the database. |

## Database

The schema lives in `src/db/schema.ts` and implements
[DATA-MODEL.md](../potato-planning/docs/DATA-MODEL.md). After changing it, run
`npm run db:generate -- --name <what_changed>` to write a new migration into
`drizzle/`, then `npm run db:migrate`.

All `datetime(3)` columns hold UTC. The mysql2 pool uses `timezone: "Z"`, SQL
defaults use `utc_timestamp(3)`, and Drizzle refreshes `updated_at` on every
update.

### IDs and seed data

Primary keys are prefixed ULIDs from `newId(prefix)` in `src/ids.ts` (e.g.
`newId("org")` → `org_01J9Z…`). Drizzle fills them in on insert when omitted.

`npm run db:seed` creates one user (`you@example.com`), one org (`default`)
with that user as `owner`, and one app (`demo`) with `development` and
`production` environments. The rows have fixed IDs (see `SEED_IDS` in
`src/db/seed.ts`), and existing rows are left alone, so it's safe to re-run.

## Authentication (v1 stub)

There is no login yet. Every management route (`/v1/…`) runs the `currentUser`
middleware (`src/auth/current-user.ts`), which loads `POTATO_CURRENT_USER_ID`
and exposes it as `c.get("currentUser")`, or responds `401` if that user
doesn't exist.

Handlers load tenant resources through the membership guards in
`src/auth/membership.ts` (`loadOrg`, `loadApplication`, `loadEnvironment`).
Each returns the row only if the current user is a member of the owning org,
and otherwise throws a `404`, so other tenants' IDs look like IDs that don't
exist.

Errors are JSON: `{ "error": "not_found", "message": "Organization not found" }`.
A `400 validation_failed` error's `details` is
`{ "issues": [{ "path": "slug", "message": "…" }] }`.

## Tests

`npm test` runs Vitest. Before the suite starts, `test/support/global-setup.ts`
creates the `TEST_DATABASE_URL` database if needed and applies all migrations
to it. Integration tests call `useTestDb()` (from `test/support/db.ts`), which
gives them a Drizzle client and truncates every table before each test. Test
files run one at a time because they share that database.

## Layout

```
src/
├── index.ts          # Entry point: loads env, creates the DB pool, starts the server
├── seed.ts           # Entry point for `npm run db:seed`
├── ids.ts            # newId(prefix): prefixed ULIDs
├── app.ts            # createApp(deps): builds the Hono app (deps injected for tests)
├── env.ts            # Environment variable parsing and validation
├── auth/
│   ├── current-user.ts  # currentUser middleware (v1 stub)
│   └── membership.ts    # loadOrg/loadApplication/loadEnvironment guards
├── domain/           # Business rules shared by routes (environment creation, flag defaults)
├── http/
│   ├── errors.ts     # apiError(), onError/notFound handlers
│   ├── serialize.ts  # Row → API resource shapes
│   └── validation.ts # Zod schemas and the validate() middleware
├── db/
│   ├── client.ts     # Drizzle + mysql2 pool, and pingDb()
│   ├── migrate.ts    # migrateDb(): applies ./drizzle migrations programmatically
│   ├── seed.ts       # seedDb() and SEED_IDS
│   └── schema.ts     # Drizzle table definitions and relations
└── routes/
    ├── health.ts     # GET /health
    └── v1/           # Management API (see API.md)
test/                 # Vitest tests (use Hono's app.request())
└── support/          # Test DB global setup and the useTestDb() helper
drizzle/              # Generated migrations
```

## Endpoints

### `GET /health`

Always returns `200` if the process is up. The body reports whether the
database answered a trivial query:

```json
{ "status": "ok", "database": "ok" }
{ "status": "ok", "database": "error", "error": "connect ECONNREFUSED ..." }
```

### Management API (`/v1`)

Implements the contract in
[API.md](../potato-planning/docs/API.md): `GET /v1/me`, apps
(`/v1/orgs/:orgId/apps`, `/v1/apps/:appId`), and environments
(`/v1/apps/:appId/environments`).
