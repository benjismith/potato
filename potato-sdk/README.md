# potato-sdk

The server-side Node.js SDK for Potato. Customers embed it in their own
servers to fetch evaluated feature flags from the Potato SDK API.

- Node.js 22+ only (server-side; not for browsers).
- **Zero runtime dependencies:** uses `node:crypto` and the global `fetch`.
- ESM, with TypeScript declarations.
- Not published to npm yet.

## Setup

```sh
npm install
npm test
```

## Scripts

| Script               | Description |
|----------------------|-------------|
| `npm run build`      | Compile `src/` to ESM JS and `.d.ts` in `dist/` with `tsc`. |
| `npm run typecheck`  | Type-check sources and tests without emitting. |
| `npm test`           | Run the Vitest suite once (`npm run test:watch` to watch). |

## Layout

```
src/
└── index.ts          # Public entry point (the package's only export)
test/                 # Vitest tests
```
