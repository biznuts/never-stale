---
description: Resume never-stale in THIS project after it was paused with /never-stale:off — flips the marker's "enabled" back to true so the auto-compact and doc-sync reminders fire again. Your recorded languages and CLAUDE.md rules block are reused as-is; nothing is re-asked.
argument-hint: "[optional project root path; defaults to cwd]"
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion
---

# never-stale — resume this project (`on`)

`on` is the other half of the `/never-stale:off` toggle: it sets the governing
marker's `"enabled"` back to `true`, re-arming the gate for new sessions. It reuses
the languages and the sentinel-fenced `CLAUDE.md` block that were already there — it
asks nothing and writes no new rules.

> If the project was never set up (no marker at all), there is nothing to resume — run
> `/never-stale:setup` instead, which asks your languages and scaffolds everything.

**Project root** = the path in `$ARGUMENTS` if given, else the current working
directory. Call it `<ROOT>`.

## Step 1 — Find the governing marker

Walk **up** from `<ROOT>` to the nearest ancestor that carries a marker, bounded by
the git repo root (same resolution the gate uses):

1. Start at `<ROOT>`. At each directory `D`, check for `D/.claude/never-stale.local.json`
   then `D/.claude/never-stale.json`.
2. If either exists, **that directory governs** — stop. (A `local` marker at `D`
   **overrides** a `team` marker at the same `D`.)
3. Otherwise, if `D/.git` exists, stop (repo root — no marker).
4. Else go up to the parent and repeat.

Read whichever marker(s) the governing directory carries. Call it `<GOV>`.

## Step 2 — Decide what to flip

- **No governing marker found** → nothing to resume. Tell the user to run
  `/never-stale:setup` to opt in, and stop.
- **Effective marker already `enabled: true`** → already active; say so and stop.
  (If the *effective* marker is a `local` one that is already enabled, the project is
  on regardless of any team marker — say so.)
- **A `local` marker governs and is `enabled: false`** → this is the paused/vetoing
  override.
  - If there is **also** a `team` marker at `<GOV>` (i.e. the local one was vetoing an
    inherited team opt-in), use **AskUserQuestion** to offer:
    1. **Re-enable the local override** — set the local marker's `"enabled"` to `true`.
    2. **Drop the local override** — delete `<GOV>/.claude/never-stale.local.json` so
       the project falls back to the (enabled) committed team marker. Offer to remove
       its `.gitignore` line too.
  - If there is **no** team marker (the local marker is the only one) → simply set the
    local marker's `"enabled"` to `true`.
- **Only a `team` marker governs and is `enabled: false`** → set the committed
  `<GOV>/.claude/never-stale.json` `"enabled"` to `true`. Note that, for teammates,
  this takes effect once committed and pulled.

For any write, confirm with **AskUserQuestion** (**Resume** / **Cancel**) first when
it edits a committed (team) file or deletes a marker; a purely-local flip can apply
directly.

## Step 3 — Apply (minimal edit)

Edit only the `"enabled"` field (or delete the local override marker, per the user's
choice). Do **not** touch `CLAUDE.md`, the recorded languages, or `events`. Leave
`version` / `createdAt` as they are.

## Step 4 — Report

Tell the user (in their spoken language):

- that never-stale is now **active** again for this project — the gate fires for new
  sessions (no restart needed, since the hooks are already loaded machine-wide);
- which marker was changed (local re-enabled, local override dropped, or team
  re-enabled), and whether the repo was affected;
- that the languages and the `CLAUDE.md` rules block are unchanged — they were reused
  as recorded;
- that `/never-stale:off` pauses it again and `/never-stale:status` shows the state.
