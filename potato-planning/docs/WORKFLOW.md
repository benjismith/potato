# Task-management workflow

All planned development work for this monorepo is tracked as Markdown files in
[`potato-planning/tasks/`](../tasks/). Think of it as a lightweight JIRA that
lives inside the repo, versioned alongside the code, and readable/writable by
both humans and AI agents.

## Directory layout

```
potato-planning/
├── docs/
│   └── WORKFLOW.md          ← this document
└── tasks/
    ├── next-id              ← next available task ID
    ├── epics/               ← cross-project epics
    │   ├── open/
    │   ├── in-progress/
    │   └── done/
    ├── potato-api/          ← one dir per sub-project
    │   ├── open/
    │   ├── in-progress/
    │   └── done/
    ├── potato-sdk/
    │   └── …
    └── potato-ui/
        └── …
```

Each sub-project gets its own directory under `tasks/`, and each of those has
one subdirectory per status: `open`, `in-progress`, and `done`. A task's
location on disk always reflects its current status. If a new sub-project is
added to the monorepo, add a matching `tasks/<sub-project>/{open,in-progress,done}`
tree for it.

**Epics** span sub-projects, so they live in `tasks/epics/` rather than under
any one project. They use the same file format and lifecycle as other tasks.

## Task IDs

- Every task has a unique **six-digit, zero-padded** numeric ID (`000000`,
  `000001`, …). IDs are unique across the whole repo, not per sub-project.
- `tasks/next-id` contains the next available ID (a single line, e.g.
  `000002`).
- **Whenever you create a task:** read `next-id`, use that value as the new
  task's ID, then increment the value in `next-id` (keeping the zero padding).
  Commit the new task file and the updated `next-id` together.
- IDs are never reused, even if a task is deleted or abandoned.

## File naming

```
<id>-<slug>.md
```

The slug is a short, lowercase, hyphenated summary of the task title. For
example: `000000-setup-api-sub-project.md`.

The filename stays the same for the lifetime of the task; only its directory
changes as it moves between statuses.

## File format

Each task file begins with YAML front-matter, followed by a Markdown body.

```markdown
---
id: "000002"
title: Add widget listing endpoint
type: feature
status: open
priority: P2
created: 2026-10-05
updated: 2026-10-05
depends_on: ["000000"]
epic: "000001"
---

# Add widget listing endpoint

## Description

What needs to be done and why, with any relevant context, constraints, or
design notes.

## Acceptance criteria

- [ ] A concrete, verifiable condition.
- [ ] Another concrete, verifiable condition.
```

### Front-matter fields

| Field        | Values / format                          | Notes |
|--------------|------------------------------------------|-------|
| `id`         | `"000000"`                               | Quoted string, so leading zeros are preserved. Must match the filename. |
| `title`      | Short imperative phrase                  | Same as the body's `#` heading. |
| `type`       | `task` \| `bug` \| `feature` \| `epic`   | |
| `status`     | `open` \| `in-progress` \| `done`        | Must match the directory the file lives in. |
| `priority`   | `P0` \| `P1` \| `P2` \| `P3` \| `P4`     | `P0` is the most urgent. |
| `created`    | `YYYY-MM-DD`                             | Set once, at creation. |
| `updated`    | `YYYY-MM-DD`                             | Bump on every edit or status change. |
| `depends_on` | List of task IDs, e.g. `["000000"]`      | `[]` if none. A task shouldn't start until its dependencies are `done`. |
| `epic`       | Task ID of the parent epic               | Optional. Omitted on epics themselves and on standalone tasks. |

### Body

1. A `#` heading with the short imperative title (e.g. "Set up the API
   sub-project").
2. A `## Description` section explaining the work.
3. An epic's description lists its child tasks in a table.
4. A `## Acceptance criteria` section, as a Markdown checklist (`- [ ]`). Each
   criterion should be concrete and independently verifiable.

## Lifecycle

```
open/  ──►  in-progress/  ──►  done/
```

1. **Create** — Allocate an ID from `next-id` (and increment it), then write
   the file into `tasks/<sub-project>/open/` with `status: open`.
2. **Start** — Move the file to `in-progress/` (use `git mv` so history
   follows it), set `status: in-progress`, and bump `updated`.
3. **Work** — Tick off acceptance criteria (`- [x]`) as they're satisfied. If
   scope changes, edit the description/criteria and bump `updated`. Any new
   work discovered along the way becomes a new task rather than scope creep.
4. **Finish** — Once every acceptance criterion is met, move the file to
   `done/`, set `status: done`, and bump `updated`. Ideally this happens in the
   same commit as the code that completes the task.

The front-matter `status` and the containing directory must always agree.

## Guidance for agents

- Before starting work, look in the relevant `open/` and `in-progress/`
  directories to find the task, and check that its `depends_on` tasks are in
  `done/`.
- Treat the acceptance criteria as the definition of done.
- Reference task IDs in commit messages (e.g. `[000000] Scaffold Hono API`).
- Never hand-pick an ID; always allocate from `next-id` and increment it.
- Design docs live alongside this one: [DATA-MODEL.md](DATA-MODEL.md) and
  [SIGNING.md](SIGNING.md). Follow them, and update them in the same commit if
  a task changes the design.

### Parallel agents

Several agents may work in the same checkout at once, each on its own
sub-project. To avoid stepping on each other:

- Only edit files inside your assigned sub-project, plus your own task files.
- Commit with explicit paths (`git add potato-sdk/ potato-planning/tasks/…`),
  never `git add -A`. If `git commit` fails on `index.lock`, wait a moment and
  retry.
- Don't create new tasks (that would race on `next-id`). Report proposed
  follow-up work to the coordinating agent instead.
- Don't push. The coordinator pushes.
