---
description: Show never-stale's status for THIS project — which marker governs it (team vs local), whether it is enabled, the recorded languages, the CLAUDE.md sentinel-fence state (present? edited since scaffold?), and whether the gate would actually fire here. Read-only: inspects and reports, writes nothing.
argument-hint: "[optional project root path; defaults to cwd]"
allowed-tools: Read, Bash, Glob
---

# never-stale — status of this project

A **read-only** health check for the current project. It writes nothing — it inspects
and reports. Use it to answer "is never-stale on here, and what would the gate do?"

**Project root** = the path in `$ARGUMENTS` if given, else the current working
directory. Call it `<ROOT>`.

## Step 1 — Resolve the governing marker (the gate's own walk)

Walk **up** from `<ROOT>` to the nearest ancestor that carries a marker, bounded by
the git repo root:

1. At each directory `D`, check `D/.claude/never-stale.local.json` then
   `D/.claude/never-stale.json`.
2. If either exists, that directory governs — stop. (`local` overrides `team` at the
   same directory.)
3. Otherwise, if `D/.git` exists, stop (repo root — no governing marker).
4. Else go to the parent and repeat.

Record the governing directory `<GOV>`, which marker is effective (local vs team), and
whether the launch dir is the marker's own directory or a descendant (the upward
walk).

## Step 2 — Inspect the artifacts

- **Marker** — read the effective marker. Report: scope (team/local), `enabled`
  (true / false / **invalid** if the JSON is corrupt — the gate treats corrupt as
  disabled), recorded `spoken` / `written`, per-event flags (`events.compact`,
  `events.edit`; absent = on), `version`, `createdAt`. If both a team and a local
  marker exist at `<GOV>`, note that the **local one wins** and show both.
- **CLAUDE.md** — at `<GOV>/CLAUDE.md` (and mention `<ROOT>/CLAUDE.md` if different):
  - is there a `<!-- never-stale:begin … -->` / `<!-- never-stale:end -->` fence?
    well-formed, missing, or malformed (unmatched / nested)?
  - if well-formed, recompute the body hash (first 16 hex of SHA-256 of the normalized
    body — LF endings, trailing whitespace stripped per line, leading/trailing blank
    lines removed) and compare to the hash in the begin sentinel: **matches** (scaffold
    intact) or **edited since scaffold**. Hash one-liner:

    ```
    node -e "const fs=require('fs'),c=require('crypto');const b=fs.readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n').map(l=>l.replace(/\s+$/,'')).join('\n').replace(/^\n+|\n+$/g,'');process.stdout.write(c.createHash('sha256').update(b).digest('hex').slice(0,16))" <bodyfile>
    ```
- **Legacy residue** — note any `<ROOT>/.claude/hooks/never-stale-reminder.js` or a
  `settings.json`/`settings.local.json` hook whose `command` contains
  `never-stale-reminder.js` (a v0.5.0 install that should be migrated via
  `/never-stale:setup` or removed via `/never-stale:remove`).

## Step 3 — Would the gate fire?

State the bottom line for this project, mirroring the gate's logic: it fires only when
a governing marker exists **and** `enabled: true` **and** the relevant per-event flag
is not `false`. So:

- no governing marker, or `enabled` not strictly `true` (false / corrupt) → **silent**;
- otherwise → **fires**: the `compact` reminder after auto-compact (unless
  `events.compact:false`) and the `edit` reminder after edits inside the project
  (unless `events.edit:false`).

Optionally verify by feeding the gate a synthetic payload (it prints a JSON line when
it would fire, nothing when silent):

```
echo {"cwd":"<ROOT>"} | node "${CLAUDE_PLUGIN_ROOT}/hooks/never-stale-gate.js" compact
```

## Step 4 — Report

Summarize (in the user's spoken language): governing marker + scope, enabled state,
languages, per-event flags, the CLAUDE.md fence state (intact / edited / missing /
malformed), any legacy residue, and the one-line verdict (fires / silent, and why).
Point to the next action: `/never-stale:setup` (opt in / reconcile),
`/never-stale:on` / `/never-stale:off` (resume / pause), or `/never-stale:remove`
(delete). Write nothing.
