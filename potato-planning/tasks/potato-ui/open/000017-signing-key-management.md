---
id: "000017"
title: Add signing-key management with in-browser keygen
type: task
status: open
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000007", "000014"]
epic: "000002"
---

# Add signing-key management with in-browser keygen

## Description

A "Signing keys" page per environment:

- **List:** keys with label, ID, fingerprint, created and last-used times, and revoked status. Each key has a revoke button with an inline confirm (no `window.confirm`).
- **Generate key:** use WebCrypto (`crypto.subtle.generateKey({ name: "Ed25519" }, true, ...)`) to make the keypair **in the browser**, export the public key as SPKI PEM and register it, then show the private key as PKCS#8 PEM **once**, with copy and download buttons and a clear "this won't be shown again" warning. The private key is never sent to the API.
- **Upload public key:** paste an existing PEM (e.g. from `npx potato-sdk keygen` or OpenSSL).
- Show the SDK config snippet (`apiUrl`, `keyId`) after creation.

## Acceptance criteria

- [ ] A generated key works end to end: requests the SDK signs with the downloaded private key verify against the API.
- [ ] Network inspection confirms the private key never leaves the browser (only `publicKeyPem` is sent).
- [ ] The private key is cleared from component state when the dialog closes.
- [ ] Revoked keys show as revoked, and SDK calls signed with them get `401 unknown_key`.
- [ ] RTL tests cover listing, the upload flow, and revoke (with mocked API calls). Key generation is tested via WebCrypto in jsdom/Node.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
