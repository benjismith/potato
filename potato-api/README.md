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
npm run dev
```

Then check `http://localhost:3000/health`.

## Environment variables

| Variable       | Default | Description |
|----------------|---------|-------------|
| `PORT`         | `3000`  | Port the HTTP server listens on. |
| `DATABASE_URL` | none    | MySQL connection string, e.g. `mysql://root@localhost:3306/potato`. Required. |
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
| `npm run db:studio`   | Open Drizzle Studio to browse the database. |

## Database

The schema lives in `src/db/schema.ts` and implements
[DATA-MODEL.md](../potato-planning/docs/DATA-MODEL.md). After changing it, run
`npm run db:generate -- --name <what_changed>` to write a new migration into
`drizzle/`, then `npm run db:migrate`.

All `datetime(3)` columns hold UTC. The mysql2 pool uses `timezone: "Z"`, SQL
defaults use `utc_timestamp(3)`, and Drizzle refreshes `updated_at` on every
update.

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
├── app.ts            # createApp(deps): builds the Hono app (deps injected for tests)
├── env.ts            # Environment variable parsing and validation
├── db/
│   ├── client.ts     # Drizzle + mysql2 pool, and pingDb()
│   ├── migrate.ts    # migrateDb(): applies ./drizzle migrations programmatically
│   └── schema.ts     # Drizzle table definitions and relations
└── routes/
    └── health.ts     # GET /health
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
