---
id: "000012"
title: Implement the SDK client and evaluate()
type: task
status: in-progress
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000011", "000009"]
epic: "000002"
---

# Implement the SDK client and evaluate()

## Description

The public API customers use:

```ts
const potato = createPotatoClient({ apiUrl, keyId, privateKey, timeoutMs? });
const flags = await potato.evaluate({ key: "alice", attributes: { plan: "pro" } });
const on = flags.get("new-checkout", false); // typed, falls back to the given default
```

`evaluate` serializes the body once, signs those exact bytes, and POSTs to `/sdk/v1/evaluate`. Failures raise a `PotatoError` that carries `status` and the server's `reason` (e.g. `stale_timestamp`). Add a short README section on clock sync and path-rewriting proxies.

## Acceptance criteria

- [x] Unit tests with a stubbed `fetch` check the URL, method, exact body bytes, and valid signature headers (verified with `node:crypto` against the matching public key).
- [x] `401` responses surface the server's `reason` on `PotatoError`. Network errors and timeouts are wrapped too.
- [x] `flags.get(key, fallback)` returns the fallback for unknown keys.
- [ ] Integration test (skipped unless `POTATO_API_URL` is set) evaluates against a running `potato-api`.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.

## Notes

- Built against the 000009 contract before that endpoint exists; unit tests use a stubbed `fetch` and verify signatures with `node:crypto` against the signing-vector public key.
- The integration test (`potato-sdk/test/integration.test.ts`) is written but not yet run. Run it once 000009 lands: register the signing-vector `publicKeyPem` in an environment, then `POTATO_API_URL=... POTATO_KEY_ID=... npm test` in `potato-sdk` (env vars documented in the README).
