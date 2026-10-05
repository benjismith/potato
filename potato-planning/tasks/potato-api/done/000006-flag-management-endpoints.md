---
id: "000006"
title: Add flag management endpoints
type: task
status: done
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000005"]
epic: "000002"
---

# Add flag management endpoints

## Description

Management API for flags, their variations, per-environment configs, and per-subject targets:

- `GET /v1/apps/:appId/flags`: list non-archived flags, each with its config summary for every environment. `?archived=true` includes archived flags.
- `POST /v1/apps/:appId/flags`: create a flag. A boolean flag gets auto-created `true`/`false` variations. Other types require ≥ 2 variations whose values match the type. Creates a config in every environment (DATA-MODEL.md defaults).
- `GET /v1/flags/:flagId`: the flag, its variations, and every environment's config and targets.
- `PATCH /v1/flags/:flagId`: name and description. `POST /v1/flags/:flagId/archive` and `/unarchive`.
- `PATCH /v1/flags/:flagId/environments/:envId`: update `enabled`, `offVariationId`, and `defaultVariationId`. Requires the current `version`, returns `409` if it's stale, and increments `version` on success.
- `PUT /v1/flags/:flagId/environments/:envId/targets/:subjectKey` with `{ variationId, version }`, and the matching `DELETE`. Both bump the config `version`.

Every write records `updated_by` / `created_by` from the current user.

## Acceptance criteria

- [x] Flag keys are validated and unique per app (`409` on duplicate). Variation values must match the flag type (`400` otherwise).
- [x] Variation IDs in config and target updates must belong to the same flag (`400` otherwise).
- [x] Optimistic concurrency works: a stale `version` gets `409`, and success returns the new `version` (tested).
- [x] Targets can be added for subject keys that have never been seen.
- [x] All routes enforce the membership guard (`404` cross-tenant, tested).
- [x] `npm run typecheck` and `npm test` pass.

## Notes

- Implements API.md as written; no contract changes.
- Choices API.md leaves open: deleting a target that doesn't exist is `404`
  (and doesn't bump the version); `variations` must be omitted for boolean
  flags (`400` otherwise); a JSON variation value of `null` is stored as JSON
  `null`; config writes are allowed on archived flags; targets are sorted by
  subject key.
- Version checks are a single conditional `UPDATE … WHERE version = ?`, so
  concurrent writers can't both succeed.
