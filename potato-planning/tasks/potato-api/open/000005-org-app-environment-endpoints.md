---
id: "000005"
title: Add org, application, and environment management endpoints
type: task
status: open
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000004"]
epic: "000002"
---

# Add org, application, and environment management endpoints

## Description

Management API (`/v1`, current-user auth) for the tenant hierarchy:

- `GET /v1/me`: the current user and the orgs they belong to.
- `GET /v1/orgs/:orgId/apps` and `POST /v1/orgs/:orgId/apps`. Creating an app also creates the `development` and `production` environments.
- `GET /v1/apps/:appId`, `GET /v1/apps/:appId/environments`, and `POST /v1/apps/:appId/environments`. Creating an environment creates a `flag_configs` row for every existing flag in the app, with the flag's defaults.

Validate request bodies (e.g. with `zod` and `@hono/zod-validator`), and return a consistent error shape: `{ error, message, details? }`.

## Acceptance criteria

- [ ] All endpoints are scoped by the membership guard. A non-member gets `404`.
- [ ] Slugs are validated against the DATA-MODEL.md pattern. A duplicate slug gets `409`.
- [ ] Creating an app creates exactly two environments. Creating an environment preserves the one-config-per-flag-per-environment invariant (tested).
- [ ] Integration tests cover the happy paths, validation errors, and cross-tenant access.
- [ ] `npm run typecheck` and `npm test` pass.
