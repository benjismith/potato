---
id: "000002"
title: Deliver feature flags v1
type: epic
status: open
priority: P0
created: 2026-10-05
updated: 2026-10-05
depends_on: []
---

# Deliver feature flags v1

## Description

Build the first end-to-end version of Potato, a self-hosted, multi-tenant feature-flag service (a LaunchDarkly clone):

- Users (stubbed current user) manage orgs, applications, environments, flags, and signing keys through the `potato-ui` dashboard and the `potato-api` management API.
- Customer servers use `potato-sdk` to fetch evaluated flags for their subjects, via signed requests the API verifies against the customer's registered Ed25519 public keys.

v1 targeting is on/off, an off variation, a default variation, and per-subject targets. Attribute rules and percentage rollouts are out of scope.

Design references: [DATA-MODEL.md](../../../docs/DATA-MODEL.md), [SIGNING.md](../../../docs/SIGNING.md).

### Child tasks

| ID | Project | Task |
|----|---------|------|
| 000003 | api | Define the v1 schema and initial migration |
| 000004 | api | Add ID generation, seed data, and the current-user stub |
| 000005 | api | Add org, application, and environment management endpoints |
| 000006 | api | Add flag management endpoints |
| 000007 | api | Add signing-key management endpoints |
| 000008 | api | Add signed-request verification middleware |
| 000009 | api | Add the SDK evaluation endpoint |
| 000010 | sdk | Set up the SDK sub-project |
| 000011 | sdk | Implement request signing |
| 000012 | sdk | Implement the SDK client and evaluate() |
| 000013 | sdk | Add the keygen CLI and example script |
| 000014 | ui  | Add the dashboard shell and navigation |
| 000015 | ui  | Add flag list, creation, and per-environment toggles |
| 000016 | ui  | Add the per-subject targeting editor |
| 000017 | ui  | Add signing-key management with in-browser keygen |

## Acceptance criteria

- [ ] All child tasks are done.
- [ ] Demo works end to end: create a flag in the UI, then `examples/evaluate.ts alice` prints its off value. Enable it and the default value prints. Add a target for `bob` and bob gets the targeted variation.
- [ ] Requests with missing, stale, tampered, replayed, revoked-key, or unknown-key signatures are refused with `401`.
- [ ] A key registered in one environment can never read flags from another environment, app, or org.
