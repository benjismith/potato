---
id: "000008"
title: Add signed-request verification middleware
type: task
status: open
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000003"]
epic: "000002"
---

# Add signed-request verification middleware

## Description

Implement the verifier in [SIGNING.md](../../../docs/SIGNING.md) as Hono middleware for `/sdk/v1/*`.

Structure it as a pure core: `buildCanonicalString(...)`, plus `verifyRequest(request, { now, lookupKey, nonceStore })`. Wrap that in a thin middleware, so the clock, key lookup, and nonce store are injectable for tests. Provide an in-memory nonce store with TTL eviction. The middleware reads the raw body once (64 KiB cap), and exposes both the verified key's environment and the raw body to the handler.

## Acceptance criteria

- [ ] Tests load `potato-planning/docs/signing-vectors.json`. Every case's canonical string is reproduced exactly, and its signature verifies against `publicKeyPem` (with an injected clock).
- [ ] Altering any single field (method, target, timestamp, nonce, one body byte) makes verification fail with `bad_signature` (tested per field).
- [ ] Each failure `reason` in SIGNING.md's verification table has a test, including revoked keys (which report `unknown_key`) and a replayed nonce.
- [ ] Nonces are recorded only after the signature verifies. A request with a bad signature does not consume its nonce (tested).
- [ ] Bodies over 64 KiB get `413`. `last_used_at` updates at most once per minute per key.
- [ ] `npm run typecheck` and `npm test` pass.
