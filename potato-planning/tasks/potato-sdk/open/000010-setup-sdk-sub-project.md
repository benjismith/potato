---
id: "000010"
title: Set up the SDK sub-project
type: task
status: open
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: []
epic: "000002"
---

# Set up the SDK sub-project

## Description

Scaffold `potato-sdk/`: a TypeScript library for **server-side Node.js** (≥ 22) that customers embed to fetch evaluated flags.

- **Zero runtime dependencies.** Use `node:crypto` and global `fetch`.
- ESM output with `.d.ts` types, built with `tsc` into `dist/`, and a `package.json` `exports` map. Package name `potato-sdk`. Not published yet.
- Vitest for tests, with the same strict tsconfig conventions as `potato-api` (a separate `tsconfig.build.json` for emit).
- Also add `potato-sdk` to the root README's sub-projects table.

## Acceptance criteria

- [ ] `potato-sdk/` has `package.json` (no `dependencies`), `tsconfig.json` (strict), `tsconfig.build.json`, `src/index.ts`, and `README.md`.
- [ ] `npm run build` emits ESM JS and `.d.ts` into `dist/`. `npm run typecheck` covers `src/` and `test/`.
- [ ] `npm test` runs Vitest with at least one passing smoke test that imports from `src/index.ts`.
- [ ] The root `README.md` lists `potato-sdk/`.
