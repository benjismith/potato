---
id: "000004"
title: Add ID generation, seed data, and the current-user stub
type: task
status: open
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

- [ ] `newId("org")` returns `org_` + a 26-char ULID. It is unit-tested for format and uniqueness.
- [ ] `npm run db:seed` is idempotent: running it twice yields the same single user, org, app, and two environments.
- [ ] Current-user middleware returns `401` if the configured user doesn't exist. Otherwise it exposes the user on the context.
- [ ] Membership guard tests: a member gets the resource, a non-member gets `404`, and a nonexistent ID gets `404`.
- [ ] New env vars are documented in `.env.example` and the API README.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.
