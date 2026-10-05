---
id: "000001"
title: Set up the UI sub-project
type: task
status: in-progress
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: []
---

# Set up the UI sub-project

## Description

Scaffold a new React single-page application in `potato-ui/`, written in
TypeScript.

- Use [Vite](https://vite.dev/) as the dev server and build tool (start from
  the `react-ts` template).
- Use [Vitest](https://vitest.dev/) with React Testing Library and `jsdom` as
  the test runner.
- Use npm for package management.

The intended production deployment is a set of static assets (the output of
`vite build`) served from an S3 bucket behind a CloudFront distribution. The
build must therefore be fully static: no server-side rendering, and client-side
routing must tolerate CloudFront serving `index.html` for unknown paths. During
the interview the app will most likely be served only from the local Vite dev
server, so AWS infrastructure is **out of scope** for this task.

The UI will talk to `potato-api` (see task `000000`). In development, configure
the Vite dev server to proxy `/api` requests to the local API, and make the API
base URL configurable via a `VITE_`-prefixed environment variable for builds.

## Acceptance criteria

- [ ] `potato-ui/` contains a Vite + React + TypeScript project (strict mode)
      with a `package.json`, `tsconfig.json`, `vite.config.ts`, and `src/`.
- [ ] `npm run dev` starts the Vite dev server and renders a placeholder app
      shell.
- [ ] `npm run build` type-checks and produces a static bundle in `dist/`
      suitable for upload to S3 (no server runtime required).
- [ ] `npm run preview` serves the built bundle locally.
- [ ] The Vite dev server proxies `/api/*` to the local `potato-api` server,
      and the API base URL is configurable via `VITE_API_BASE_URL`, documented
      in a committed `.env.example`.
- [ ] `npm test` runs Vitest (jsdom environment) with at least one passing
      React Testing Library test that renders the app shell.
- [ ] `potato-ui/README.md` documents setup, scripts, environment variables,
      and notes the intended S3 + CloudFront deployment model.
