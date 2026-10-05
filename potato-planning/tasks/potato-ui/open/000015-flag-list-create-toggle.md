---
id: "000015"
title: Add flag list, creation, and per-environment toggles
type: task
status: open
priority: P1
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000006", "000014"]
epic: "000002"
---

# Add flag list, creation, and per-environment toggles

## Description

The flags page for the selected app and environment:

- **List:** each flag's key, name, type, an on/off toggle for the current environment, and the served (off/default) variation.
- **Create flag:** a form with key, name, description, and type. Boolean flags only need key and name. Non-boolean types get a variations editor.
- **Flag detail page:** edit name and description, choose the off and default variations for the current environment, and archive or unarchive.
- **Toggles and edits** send the config `version`. On `409`, refetch and tell the user someone else changed the flag.

## Acceptance criteria

- [ ] A boolean flag can be created, toggled, and archived entirely from the UI.
- [ ] Toggling is optimistic and rolls back on error. A `409` shows a conflict message and refreshes.
- [ ] Client-side key validation matches the API's pattern.
- [ ] RTL tests cover create, toggle, and the `409` path (with mocked API calls).
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
