---
id: "000000"
title: Set up the API sub-project
type: task
status: done
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: []
---

# Set up the API sub-project

## Description

Scaffold a new TypeScript project in `potato-api/` to serve as the backend REST
API for the application.

- Use [Hono](https://hono.dev/) as the HTTP/REST framework, running on Node.js
  via `@hono/node-server`.
- Use [Drizzle ORM](https://orm.drizzle.team/) with MySQL (`mysql2` driver) for
  persistence, with `drizzle-kit` for schema migrations.
- Use npm for package management, Vitest as the test runner, and `tsx` for a
  fast watch-mode dev server.
- Database connection settings come from environment variables (e.g.
  `DATABASE_URL`), with a committed `.env.example` and a git-ignored `.env`.
- Develop against the existing local MySQL server (no Docker), so the API can
  be started without any cloud resources.

The domain model is not yet known, so keep the schema minimal: just enough to
prove the end-to-end wiring (Hono route → Drizzle query → MySQL) works.

## Acceptance criteria

- [x] `potato-api/` contains a `package.json`, `tsconfig.json` (strict mode),
      and `src/` directory with an entry point that starts a Hono server.
- [x] `npm run dev` starts the API in watch mode on a configurable port
      (default `3000`).
- [x] `npm run build` compiles cleanly with `tsc`, and `npm start` runs the
      compiled output.
- [x] `GET /health` returns `200` with a JSON body that reports API status and
      whether the database connection succeeds.
- [x] Drizzle is configured (`drizzle.config.ts`, `src/db/schema.ts`,
      `src/db/client.ts`) against MySQL, and `npm run db:generate` /
      `npm run db:migrate` scripts exist and work.
- [x] The API connects to the existing local MySQL server, and `.env.example`
      documents all required environment variables.
- [x] `npm test` runs Vitest, with at least one passing test that exercises the
      `/health` route via Hono's `app.request()` test helper.
- [x] `potato-api/README.md` documents setup, scripts, and environment
      variables.
