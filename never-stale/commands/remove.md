---
description: Remove never-stale from THIS project entirely — delete the opt-in marker and strip the sentinel-fenced CLAUDE.md rules block (and migrate away any legacy v0.5.0 residue). Destructive but surgical: it touches only never-stale's own artifacts, shows a plan, and confirms first. To merely pause without deleting, use /never-stale:off.
argument-hint: "[optional project root path; defaults to cwd] [--dry-run]"
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# never-stale — remove it from this project

Inverse of `/never-stale:setup`: remove never-stale's footprint from this project and
nothing else. This is the **destructive** verb — it deletes the marker and strips the
`CLAUDE.md` rules block.

> Just want to silence the reminders for a while? Use `/never-stale:off` instead — it
> pauses without deleting anything, and `/never-stale:on` brings it back.

**Project root** = the path in `$ARGUMENTS` (ignoring any flag) if given, else the
current working directory. Call it `<ROOT>`.

**Dry-run.** If `$ARGUMENTS` contains `--dry-run`, only print the removal plan, then
STOP without removing anything.

**Safety contract.** Remove ONLY never-stale's own artifacts. The marker is 100%
never-stale-owned (no user prose) so it is always safe to delete. For CLAUDE.md,
remove by **sentinel fence**, never by guessing boundaries. Never touch foreign
hooks, the user's own CLAUDE.md prose outside the fence, other settings, or
`settings.local.json` (read it for awareness, never modify it). Show a plan and get
confirmation before removing anything.

## Step 1 — Detect never-stale's artifacts

- **Marker(s)** — `<ROOT>/.claude/never-stale.json` and/or
  `<ROOT>/.claude/never-stale.local.json` present → **REMOVE** (delete file). Path-
  based, always reliable, no content matching. If a `local` marker was gitignored,
  also offer to remove its `.gitignore` line.
- **CLAUDE.md fence** — locate the `<!-- never-stale:begin … -->` /
  `<!-- never-stale:end -->` pair:
  - well-formed pair → **REMOVE the whole span** (including the sentinels and one
    trailing blank line), regardless of how the body was edited. If the body hash no
    longer matches the hash in the begin sentinel, note "you edited this since
    scaffold — removing discards your edits" and offer a **Keep** option, but never
    let an edit *block* removal.
  - **begin without a matching end** (or end without begin) → remove **nothing**;
    flag "malformed never-stale block — manual review" with the line number. Never
    guess a boundary.
  - **multiple** well-formed pairs (a botched double-run) → remove each; flag any
    unmatched sentinel.
  - **nested / overlapping** sentinels → refuse and flag.
- **Legacy v0.5.0 residue** — `<ROOT>/.claude/hooks/never-stale-reminder.js` and any
  `settings.json` hook whose `command` contains `never-stale-reminder.js` → plan to
  REMOVE (migration teardown). `settings.local.json` is never edited; flag a legacy
  hook there for manual removal.

## Step 2 — Removal plan (dry-run) and confirm

Show a plan, one line per artifact, e.g.:

```
.claude/never-stale.json                REMOVE (marker)
CLAUDE.md · sentinel block              REMOVE (whole fenced span)
legacy .claude/hooks/never-stale-...js  REMOVE
legacy settings.json hooks              REMOVE (2)
CLAUDE.md · sentinel block              KEEP? — body edited since scaffold (your call)
```

- If `$ARGUMENTS` also has `--dry-run`: stop here, remove nothing.
- If nothing is detected: say the project has no never-stale setup, stop.
- Otherwise confirm via **AskUserQuestion**: **Remove** / **Cancel**. For an edited
  fenced block flagged KEEP?, let the user choose to remove it anyway.

## Step 3 — Apply the removal

- Delete the approved marker file(s); if removing a `local` marker, optionally remove
  its `.gitignore` line.
- `CLAUDE.md`: delete the approved fenced span(s) (sentinels included), preserving all
  other content and spacing. If removing them leaves nothing but the `# Project
  rules` title (never-stale wrote the whole file), offer to delete the file;
  otherwise keep it.
- Legacy: delete the script file; in `settings.json` only, remove the never-stale
  hook objects and prune emptied containers down to (not below) `{}`.
- Never modify `settings.local.json`.

## Step 4 — Report

Tell the user (in their spoken language): what was removed vs kept (and why a KEEP
was kept); that, since the hooks now ship in the plugin and are gated by the marker,
**deleting the marker disarms the gate for new sessions immediately** (a restart only
clears the reminder from the *current* session, or finishes removing a legacy
project hook); that the plugin itself is still installed machine-wide (use
`/plugin uninstall never-stale@biznuts` to remove it everywhere at once — a clean,
symmetric removal that leaves no executable code in any project); and that only this
project was touched. If they only wanted to silence it temporarily, remind them that
`/never-stale:off` would have paused it reversibly.
