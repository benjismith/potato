# potato

A monorepo containing a web application and its supporting planning docs.

## Sub-projects

| Directory                              | Purpose |
|----------------------------------------|---------|
| [`potato-api/`](potato-api/)           | Backend REST API: TypeScript, Hono, Drizzle ORM, MySQL. |
| [`potato-ui/`](potato-ui/)             | Frontend SPA: React, TypeScript, Vite, Vitest. |
| [`potato-sdk/`](potato-sdk/)           | Server-side Node.js SDK: signs requests and fetches evaluated flags. Zero runtime deps. |
| [`potato-planning/`](potato-planning/) | Planning docs and the in-repo task tracker. |

## Design docs

- [Data model](potato-planning/docs/DATA-MODEL.md): tenants, flags, environments, subjects, and v1 evaluation.
- [Management API](potato-planning/docs/API.md): the `/v1` contract between `potato-api` and `potato-ui`.
- [Request signing](potato-planning/docs/SIGNING.md): how SDK requests are signed with Ed25519 and verified.

## Workflow

Development work is planned and tracked as Markdown task files under
`potato-planning/tasks/`. See
[**potato-planning/docs/WORKFLOW.md**](potato-planning/docs/WORKFLOW.md) for
the full task-management workflow (IDs, file format, and lifecycle).
