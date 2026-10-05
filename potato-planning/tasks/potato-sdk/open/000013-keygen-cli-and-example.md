---
id: "000013"
title: Add the keygen CLI and example script
type: task
status: open
priority: P2
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000012"]
epic: "000002"
---

# Add the keygen CLI and example script

## Description

- `npx potato-sdk keygen` (a `bin` entry) writes `potato-private.pem` (mode `0600`) and `potato-public.pem` to the current directory, refuses to overwrite either, and prints the public key to paste into the dashboard.
- `examples/evaluate.ts`: about 20 lines. It reads `POTATO_API_URL`, `POTATO_KEY_ID`, and `POTATO_PRIVATE_KEY_PATH` from `.env`, evaluates flags for the subject key given in `argv`, and prints them. This is the epic's demo script.
- Document both in the SDK README, including the demo walkthrough.

## Acceptance criteria

- [ ] `keygen` output is a valid Ed25519 keypair (tested by signing and verifying), and it refuses to overwrite existing files.
- [ ] `npx tsx examples/evaluate.ts alice` prints the evaluated flags against a running API.
- [ ] `.env.example` in `potato-sdk/` documents the example's variables.
