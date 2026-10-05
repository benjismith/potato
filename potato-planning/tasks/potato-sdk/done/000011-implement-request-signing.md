---
id: "000011"
title: Implement request signing
type: task
status: done
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000010"]
epic: "000002"
---

# Implement request signing

## Description

Implement the signer side of [SIGNING.md](../../../docs/SIGNING.md) in `potato-sdk/src/signing.ts`:

- `buildCanonicalString({ keyId, method, target, timestamp, nonce, bodySha256 })`
- `signRequest({ keyId, privateKey, method, target, body, now?, nonce? })` returns the four `X-Potato-*` headers. `now` and `nonce` are injectable for tests. Otherwise it uses the real clock and 16 random bytes, base64url-encoded.
- Accept the private key as a PKCS#8 PEM string or a `KeyObject`. Reject non-Ed25519 keys with a clear error.

## Acceptance criteria

- [x] Tests load `potato-planning/docs/signing-vectors.json`. For every case, the body SHA-256, the canonical string, and the signature match exactly.
- [x] Without injection, each call produces a unique nonce in the spec's format and the current Unix-seconds timestamp.
- [x] The signature header is unpadded base64url, 86 characters long.
- [x] RSA/EC private keys and public keys are rejected with a descriptive error (tested).
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.
