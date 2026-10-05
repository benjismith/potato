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
├── client.ts         # createPotatoClient, evaluate, PotatoFlags, PotatoError
└── signing.ts        # Ed25519 request signing (SIGNING.md)
test/                 # Vitest tests (signing tests load the shared vectors;
                      # integration.test.ts needs a running potato-api)
```

## Usage

```ts
import { createPotatoClient, PotatoError } from "potato-sdk";

// Create once at startup. Config is validated eagerly (key ID format,
// Ed25519 private key, apiUrl), so mistakes throw a TypeError right here.
const potato = createPotatoClient({
  apiUrl: "https://potato.example.com",       // a base path like https://example.com/potato is fine
  keyId: process.env.POTATO_KEY_ID!,          // key_<ULID>, from the dashboard
  privateKey: process.env.POTATO_PRIVATE_KEY!, // PKCS#8 PEM (or a KeyObject)
  timeoutMs: 2000,                            // optional, default 5000
});

try {
  const flags = await potato.evaluate({ key: "alice", attributes: { plan: "pro" } });
  const newCheckout = flags.get("new-checkout", false); // boolean
  const color = flags.get("banner-color", "green");      // string
} catch (err) {
  if (err instanceof PotatoError) {
    // err.status: HTTP status, or null for network errors and timeouts
    // err.error:  server error code ("unauthorized", ...) or "network_error",
    //             "timeout", "invalid_response", "http_error", "payload_too_large"
    // err.reason: for 401s, why (e.g. "stale_timestamp", "bad_signature")
    console.warn(`Potato unavailable: ${err.message}`);
  }
  // Fall back to your defaults.
}
```

- `evaluate(subject)` POSTs to `<apiUrl>/sdk/v1/evaluate`. `subject.key` must
  be a non-empty string of at most 255 chars; `attributes`, if given, a plain
  object. Invalid subjects throw a `TypeError` without a request being made.
- `flags.get(key, fallback)` returns `fallback` when the flag is unknown **or**
  when its value's JSON type (boolean, number, string, array, object) doesn't
  match the fallback's, so the result is always the fallback's type. A `null`
  fallback accepts any value. Also: `flags.has(key)`, `flags.keys()`, and
  `flags.toJSON()` for the raw `{ flagKey: value }` map.
- The SDK never retries. Each call signs afresh (new timestamp and nonce), so
  calling `evaluate` again is a safe retry.
- Redirects are refused (`network_error`): a redirect to another path would
  break the signature anyway. Point `apiUrl` at the final URL.
- `fetch` can be injected via the `fetch` option (handy for tests). It defaults
  to `globalThis.fetch`, looked up on each call.

## Deployment notes

### Clock sync

Requests carry a Unix timestamp, and the API rejects any more than **300
seconds** off its own clock with `401` reason `stale_timestamp`. Keep the
servers running the SDK synced with NTP (chrony, systemd-timesyncd, or your
cloud provider's time service). If you see `stale_timestamp`, check the clock
on the calling host first.

### Proxies and path rewriting

The signature covers the request path (plus query) exactly as it reaches the
API, but not the host or scheme. So:

- If the API is served under a base path (e.g. `https://example.com/potato`),
  put that base path in `apiUrl`. The SDK signs `/potato/sdk/v1/evaluate`.
- A proxy between the SDK and the API **must not rewrite the path** (e.g. strip
  `/potato` before forwarding). The API would then see a different path from
  the one signed and answer `401 bad_signature`. Either forward the path
  unchanged and serve the API under the same prefix, or don't rewrite.
- Proxies may change the host, scheme, and port, and terminate TLS.
- Proxies must forward the body byte-for-byte (no re-encoding or JSON
  reformatting) and keep the four `X-Potato-*` headers.

## Request signing

`createPotatoClient` signs for you; these are the lower-level pieces. Every SDK API request is signed per
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

## Integration test

`test/integration.test.ts` runs against a real `potato-api` and is skipped
unless `POTATO_API_URL` is set.

| Variable                  | Required | Description |
|---------------------------|----------|-------------|
| `POTATO_API_URL`          | yes      | API base URL, e.g. `http://localhost:3000`. Enables the test. |
| `POTATO_KEY_ID`           | yes      | ID of a registered key in some environment. |
| `POTATO_PRIVATE_KEY`      | no       | That key's PKCS#8 PEM. |
| `POTATO_PRIVATE_KEY_FILE` | no       | Path to the PEM, instead of `POTATO_PRIVATE_KEY`. |
| `POTATO_SUBJECT_KEY`      | no       | Subject key to evaluate for (default `potato-sdk-integration`). |
| `POTATO_EXPECTED_FLAGS`   | no       | JSON object the returned flags must contain, e.g. `{"new-checkout":true}`. |

With no private key given, the test uses the **test-only** key from
`potato-planning/docs/signing-vectors.json`, so register that file's
`publicKeyPem` in an environment and pass the resulting key ID:

```sh
POTATO_API_URL=http://localhost:3000 POTATO_KEY_ID=key_01J... npm test
```

Besides evaluating, it checks that a wrong private key gets `401
bad_signature` and an unregistered key ID gets `401 unknown_key`.
