---
id: "000004"
title: Add ID generation, seed data, and the current-user stub
type: task
status: done
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000003"]
epic: "000002"
---

# Add ID generation, seed data, and the current-user stub

## Description

Add the shared building blocks the management API needs:

- **IDs:** a `newId(prefix)` helper that produces `<prefix>_<ULID>` (prefixes in DATA-MODEL.md).
- **Seed:** an idempotent `npm run db:seed` that creates one user, one org (with the user as `owner`), and one app with `development` and `production` environments.
- **Current user:** a Hono middleware that resolves the current user from `POTATO_CURRENT_USER_ID` (defaulting to the seeded user), loads it, and puts it on the request context. Management routes use `c.get("currentUser")`.
- **Membership guard:** a helper that loads an org, application, or environment by ID only if the current user is a member of the owning org, and returns `404` (not `403`) otherwise, so other tenants' IDs aren't revealed.

## Acceptance criteria

- [x] `newId("org")` returns `org_` + a 26-char ULID. It is unit-tested for format and uniqueness.
- [x] `npm run db:seed` is idempotent: running it twice yields the same single user, org, app, and two environments.
- [x] Current-user middleware returns `401` if the configured user doesn't exist. Otherwise it exposes the user on the context.
- [x] Membership guard tests: a member gets the resource, a non-member gets `404`, and a nonexistent ID gets `404`.
- [x] New env vars are documented in `.env.example` and the API README.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.

## Notes

- ULIDs come from a small `node:crypto` implementation in `src/ids.ts` (no
  new dependency). Schema ID columns default to `newId(<prefix>)` via
  `$defaultFn`, which doesn't change the SQL.
- Seed rows have fixed, well-formed IDs (`SEED_IDS`, e.g.
  `usr_0000000000000000000000SEED`), which gives `POTATO_CURRENT_USER_ID` a
  stable default.
- Guards are `loadOrg` / `loadApplication` / `loadEnvironment` in
  `src/auth/membership.ts`. They throw a JSON `404` (`apiError`, in
  `src/http/errors.ts`). The `currentUser` middleware isn't mounted in
  `createApp` yet, because there are no `/v1` routes; 000005 mounts it.
