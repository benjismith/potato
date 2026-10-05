---
id: "000007"
title: Add signing-key management endpoints
type: task
status: open
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000005"]
epic: "000002"
---

# Add signing-key management endpoints

## Description

Management API for registering customers' Ed25519 public keys against an environment (see [SIGNING.md](../../../docs/SIGNING.md)):

- `GET /v1/environments/:envId/keys`: list keys (ID, label, algorithm, created/last-used/revoked timestamps, and a short fingerprint). Never echo full PEMs in lists.
- `POST /v1/environments/:envId/keys` with `{ label, publicKeyPem }`: validate with `crypto.createPublicKey` that it's an SPKI Ed25519 public key, and reject private keys and other algorithms. Returns the new `key_…` ID.
- `POST /v1/keys/:keyId/revoke`: sets `revoked_at`. This is irreversible.

Fingerprint: the first 16 hex characters of the SHA-256 of the raw 32-byte public key, shown in the UI so customers can match keys.

## Acceptance criteria

- [ ] Valid Ed25519 SPKI PEMs are accepted. RSA/EC keys, private keys, and garbage are rejected with `400` and a clear message (tested with each).
- [ ] Submitting a *private* key returns `400` and the key is never stored or logged.
- [ ] Revoking is idempotent, and revoked keys still appear in the list with `revokedAt`.
- [ ] All routes enforce the membership guard (`404` cross-tenant, tested).
- [ ] `npm run typecheck` and `npm test` pass.
