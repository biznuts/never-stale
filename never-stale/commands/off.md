---
description: Pause never-stale in THIS project — silence the auto-compact and doc-sync reminders without deleting anything. Reversible: it flips the marker's "enabled" to false and keeps the marker, your recorded languages, and the CLAUDE.md rules block intact. Resume any time with /never-stale:on.
argument-hint: "[optional project root path; defaults to cwd]"
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion
---

# never-stale — pause this project (`off`)

`off` and `/never-stale:on` are a **reversible toggle**. `off` is the light switch:
it sets the governing marker's `"enabled"` to `false`, so the gate goes silent for new
sessions — but it **keeps** the marker file, your recorded `spoken`/`written`
languages, and the sentinel-fenced `CLAUDE.md` block. Nothing is deleted. To turn it
back on, run `/never-stale:on` (the languages come back exactly as they were).

> Pausing is not removing. If you want the marker and the `CLAUDE.md` rules block
> *gone*, use `/never-stale:remove` instead.

**Project root** = the path in `$ARGUMENTS` if given, else the current working
directory. Call it `<ROOT>`.

## Step 1 — Find the governing marker

The gate resolves a project by walking **up** from the launch dir to the nearest
ancestor that carries a marker, bounded by the git repo root. Reproduce that walk to
find which marker governs `<ROOT>`:

1. Start at `<ROOT>`. At each directory `D`, check for `D/.claude/never-stale.local.json`
   then `D/.claude/never-stale.json`.
2. If either exists, **that directory governs** — stop here. (A `local` marker
   present at `D` **overrides** a `team` marker at the same `D`.)
3. Otherwise, if `D/.git` exists, stop (the repo root bounds the walk — no marker).
4. Else go up to the parent and repeat, until a marker is found, a `.git` is hit, or
   the filesystem root is reached.

Read whichever marker(s) the governing directory carries. Call the governing
directory `<GOV>`.

## Step 2 — Decide what to flip, then confirm

- **No governing marker found** → this project is not opted in, so there is nothing to
  pause. Tell the user to run `/never-stale:setup` to opt in, and stop.
- **Marker already `enabled: false`** → already paused. Say so (and that
  `/never-stale:on` resumes it), and stop.
- **A `local` marker governs (`<GOV>/.claude/never-stale.local.json`)** → flip **that**
  file's `"enabled"` to `false`. This is purely local; the repo is unaffected. Confirm
  with **AskUserQuestion** (**Pause** / **Cancel**), then apply.
- **Only a `team` marker governs (`<GOV>/.claude/never-stale.json`, no local at
  `<GOV>`)** → editing the committed marker would, once committed, pause it for the
  **whole team**. Use **AskUserQuestion** to offer:
  1. **Pause just for me (recommended)** — create a `local` override at `<GOV>`:
     write `<GOV>/.claude/never-stale.local.json` with `"enabled": false` (copy
     `spoken`/`written` from the team marker for reference), and ensure
     `.claude/never-stale.local.json` is gitignored (append to `<GOV>/.gitignore`,
     or create it). The committed team marker is **untouched**; a local marker
     overrides it, so the gate sees `enabled: false` and stays silent — for this
     checkout only.
  2. **Pause for the whole team** — set the committed `<GOV>/.claude/never-stale.json`
     `"enabled"` to `false`. Warn that this only takes effect for teammates once it is
     committed and pulled.
  3. **Cancel** — do nothing.

## Step 3 — Apply (minimal edit)

Edit only the `"enabled"` field (or, for option 1 above, write the small local
override marker + gitignore line). Do **not** touch `CLAUDE.md`, the recorded
languages, `events`, foreign files, or `settings.local.json`. Leave `version` /
`createdAt` as they are.

## Step 4 — Report

Tell the user (in their spoken language):

- that never-stale is now **paused** for this project — the gate goes silent for new
  sessions (a restart only clears the reminder from the *current* session);
- exactly **which** marker was flipped (local vs team), and — if a local override was
  created to veto a team marker — that the repo was not changed;
- that nothing was deleted: the marker, the recorded languages, and the `CLAUDE.md`
  rules block are all still there;
- that **`/never-stale:on` turns it back on** with the same languages; `/never-stale:status`
  shows the current state; `/never-stale:remove` deletes the setup entirely.
