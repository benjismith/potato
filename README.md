# potato

A monorepo containing a web application and its supporting planning docs.

## Sub-projects

| Directory                              | Purpose |
|----------------------------------------|---------|
| [`potato-api/`](potato-api/)           | Backend REST API: TypeScript, Hono, Drizzle ORM, MySQL. |
| [`potato-ui/`](potato-ui/)             | Frontend SPA: React, TypeScript, Vite, Vitest. |
| [`potato-planning/`](potato-planning/) | Planning docs and the in-repo task tracker. |

## Workflow

Development work is planned and tracked as Markdown task files under
`potato-planning/tasks/`. See
[**potato-planning/docs/WORKFLOW.md**](potato-planning/docs/WORKFLOW.md) for
the full task-management workflow (IDs, file format, and lifecycle).
