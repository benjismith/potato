---
id: "000005"
title: Add org, application, and environment management endpoints
type: task
status: done
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

- [x] All endpoints are scoped by the membership guard. A non-member gets `404`.
- [x] Slugs are validated against the DATA-MODEL.md pattern. A duplicate slug gets `409`.
- [x] Creating an app creates exactly two environments. Creating an environment preserves the one-config-per-flag-per-environment invariant (tested).
- [x] Integration tests cover the happy paths, validation errors, and cross-tenant access.
- [x] `npm run typecheck` and `npm test` pass.

## Notes

- Implements API.md exactly. `validation_failed` details are
  `{ issues: [{ path, message }] }` (API.md leaves the shape open).
- Lists are ordered by `name` (orgs, apps) and by creation (environments).
  ULIDs are now monotonic within a millisecond, so environments created in the
  same millisecond still list in creation order.
- `createApp` now takes `db` and `currentUserId`, mounts the `currentUser`
  middleware on `/v1/*`, and renders all errors (including unknown routes and
  malformed JSON) in the standard JSON error shape.
