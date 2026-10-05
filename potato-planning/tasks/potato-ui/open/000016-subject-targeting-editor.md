---
id: "000016"
title: Add the per-subject targeting editor
type: task
status: open
priority: P2
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000015"]
epic: "000002"
---

# Add the per-subject targeting editor

## Description

On the flag detail page, for the current environment: list targets (subject key → variation), add a target (subject key plus variation picker), change a target's variation, and remove targets. Adding a target works for subject keys that have never been seen. Edits send the config `version` and handle `409` as in task 000015.

## Acceptance criteria

- [ ] Targets can be added, changed, and removed, and the changes persist across a reload.
- [ ] A target added for an unseen subject key works (verified via the SDK demo in task 000013).
- [ ] RTL tests cover add, remove, and the `409` path.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
