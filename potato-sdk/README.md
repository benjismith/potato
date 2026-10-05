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
├── index.ts          # Public entry point (the package's only export)
└── signing.ts        # Ed25519 request signing (SIGNING.md)
test/                 # Vitest tests (signing tests load the shared vectors)
```

## Request signing

Every SDK API request is signed per
[SIGNING.md](../potato-planning/docs/SIGNING.md). `signRequest` returns the
four `X-Potato-*` headers:

```ts
import { signRequest } from "potato-sdk";

const body = JSON.stringify({ subject: { key: "alice" } }); // serialize once
const headers = signRequest({
  keyId: "key_01J...",
  privateKey: process.env.POTATO_PRIVATE_KEY!, // PKCS#8 PEM, or a KeyObject
  method: "POST",
  target: "/sdk/v1/evaluate", // path + "?query", exactly as sent
  body,
});
await fetch(`https://potato.example.com/sdk/v1/evaluate`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body, // the same bytes that were signed
});
```

- Send exactly the signed `body` to exactly the signed `target`, using the
  uppercase method.
- Each call uses the current time and a fresh nonce; sign again for retries.
- `loadPrivateKey` validates a key up front. Non-Ed25519 keys and public keys
  are rejected with a descriptive `TypeError`.
- Lower-level helpers: `buildCanonicalString`, `hashBody`, `generateNonce`.
