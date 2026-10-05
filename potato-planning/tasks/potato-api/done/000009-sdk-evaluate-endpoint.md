---
id: "000009"
title: Add the SDK evaluation endpoint
type: task
status: done
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000006", "000008"]
epic: "000002"
---

# Add the SDK evaluation endpoint

## Description

`POST /sdk/v1/evaluate` behind the signature middleware. Body: `{ "subject": { "key": string, "attributes"?: object } }`. Response: `{ "flags": { "<flagKey>": <value>, ... } }`, evaluated for the signing key's environment using the v1 algorithm in DATA-MODEL.md (off → off variation, target → targeted variation, otherwise the default variation). Archived flags are excluded.

Error responses use the shared shape `{ error, message, details? }`. An invalid body gets `400` with `error: "validation_failed"` and `details: { issues: [{ path, message }] }`, matching the management API. A successful response is always a JSON object `{ "flags": { … } }`, whose values are the variations' raw JSON values.

Upsert the subject (`first_seen_at`, `last_seen_at`, `attributes`) on each call. Put the evaluation logic in a pure function, `evaluateFlags(flags, configs, targets, subjectKey)`, that is unit-tested without a database.

## Acceptance criteria

- [x] Pure evaluation unit tests: disabled → off variation, enabled → default, targeted subject → target variation, archived flag omitted.
- [x] Integration test: register the test-vector public key in an environment, send a request signed with the test private key and a fresh timestamp and nonce, and get correct values back.
- [x] Tenant isolation test: a key from environment A never returns environment B's state, even for the same app's flags (B's configs differ from A's).
- [x] Invalid bodies (missing or empty `subject.key`, key > 255 chars) get `400`.
- [x] The subject row is created on first evaluation, and `last_seen_at` updates on later ones.
- [x] `npm run typecheck` and `npm test` pass.
