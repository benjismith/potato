# potato-ui

The Potato web front end: a React + TypeScript single-page app built with
[Vite](https://vite.dev/) and tested with [Vitest](https://vitest.dev/) and
React Testing Library.

## Setup

```sh
npm install
cp .env.example .env
npm run dev            # http://localhost:5173
```

Run `potato-api` alongside it (`npm run dev` in `../potato-api`).

## Environment variables

| Variable            | Default                 | Description |
|---------------------|-------------------------|-------------|
| `VITE_API_BASE_URL` | `/api`                  | Base URL the browser uses for API calls. Baked in at build time. |
| `API_PROXY_TARGET`  | `http://localhost:3000` | Dev server only: where the `/api` proxy forwards requests. |

In development, the Vite dev server proxies `/api/*` to `API_PROXY_TARGET`,
stripping the `/api` prefix (so `/api/health` → `http://localhost:3000/health`).
The browser only ever talks to one origin, so no CORS setup is needed locally.

## Scripts

| Script               | Description |
|----------------------|-------------|
| `npm run dev`        | Start the Vite dev server with HMR. |
| `npm run build`      | Type-check (`tsc -b`) and build static assets into `dist/`. |
| `npm run preview`    | Serve the built `dist/` locally (with SPA fallback, so deep links work). |
| `npm run typecheck`  | Type-check only. |
| `npm run lint`       | Lint with oxlint. |
| `npm test`           | Run the Vitest suite once (`npm run test:watch` to watch). |

## Routes

| URL | Page |
|-----|------|
| `/` | Redirects to the first org, app and environment. |
| `/orgs/:orgId`, `/orgs/:orgId/apps/:appId` | Redirect to that org's/app's first environment. |
| `/orgs/:orgId/apps/:appId/envs/:envSlug/flags` | Flags in that environment. |

The header shows the current user (`GET /v1/me`); the bar below it switches
org, app and environment. Switching environment keeps you on the same page.
The footer shows the API/database status.

## Layout

```
src/
├── main.tsx          # Entry point; mounts <App /> in a <BrowserRouter>
├── App.tsx           # Route table
├── api/              # Typed API client (one function per endpoint; see potato-planning/docs/API.md)
├── components/       # Shared UI: Shell (frame), ContextBar (switchers), Status (loading/error)
├── pages/            # One component per route
├── hooks/useAsync.ts # Loading/error/data state for an API call
├── me.ts, env.ts     # Context hooks: useMe() (current user), useEnv() (org/app/environment)
├── paths.ts          # URL builders
├── index.css         # Global styles
└── test/             # Vitest setup and helpers (mockApi, fixtures, renderApp)
```

Tests live next to the code they cover (`*.test.tsx`) and run in `jsdom`.
They mock `fetch` with `mockApi()` from `src/test/mockApi.ts`.

## Deployment (planned)

`npm run build` produces a fully static bundle in `dist/`: no server runtime.
The intended production setup is:

- **S3:** upload `dist/` to a private bucket.
- **CloudFront:** serve the bucket via Origin Access Control.
  - Map `403`/`404` errors to `/index.html` with a `200` status, so client-side
    routes work on deep links and refreshes.
  - Cache `assets/*` (content-hashed filenames) for a long time. Serve
    `index.html` with `Cache-Control: no-cache` so new deploys are picked up.
- **API:** set `VITE_API_BASE_URL` at build time to wherever `potato-api` is
  deployed. That could be a separate origin (which needs CORS on the API), or
  an `/api/*` CloudFront behavior pointing at the API origin. The API serves
  routes without an `/api` prefix, so the second option would also need the
  prefix stripped (e.g. with a CloudFront Function).

None of this infrastructure exists yet. For now the app runs from the local dev
server.
