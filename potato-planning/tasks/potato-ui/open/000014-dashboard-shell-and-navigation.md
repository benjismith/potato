---
id: "000014"
title: Add the dashboard shell and navigation
type: task
status: open
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000005"]
epic: "000002"
---

# Add the dashboard shell and navigation

## Description

Turn the placeholder app into the dashboard frame:

- Add client-side routing (React Router), with URLs like `/orgs/:orgId/apps/:appId/envs/:envSlug/flags`.
- The header shows the current user (from `GET /v1/me`), an org/app switcher, and an environment switcher that keeps the current page when switching environments.
- Typed API client functions for the endpoints in task 000005, with a consistent loading and error UI.
- Visiting `/` redirects to the first org, app, and environment.

Keep the existing API-health indicator somewhere unobtrusive, e.g. a footer.

## Acceptance criteria

- [ ] Deep links work under `npm run dev` and `npm run preview` (SPA fallback).
- [ ] Switching environments changes the URL and keeps the current page.
- [ ] API errors render an inline error state, not a blank screen.
- [ ] React Testing Library tests cover the redirect from `/` and the environment switch (with mocked API calls).
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
