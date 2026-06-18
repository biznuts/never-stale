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

Read the **installed plugin version** from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`
(`version`); call it `<PV>`. Use it for the drift checks below. If you cannot resolve
`${CLAUDE_PLUGIN_ROOT}`, skip the version-drift line rather than guessing.

- **Marker** — read the effective marker. Report: scope (team/local), `enabled`
  (true / false / **invalid** if the JSON is corrupt — the gate treats corrupt as
  disabled), recorded `spoken` / `written` (with `spokenCode` / `writtenCode` if
  present), per-event flags (`events.compact`, `events.edit`; absent = on), `version`,
  `createdAt`. If both a team and a local marker exist at `<GOV>`, note that the
  **local one wins** and show both.
  - **Version drift** — if `version` !== `<PV>`, note it: "marker written by
    `<version>`, plugin is `<PV>`." Make clear this is **cosmetic** — the gate ignores
    the version — and that `/never-stale:update` reconciles it.
  - **Language codes** — if `spokenCode` / `writtenCode` are missing, or the display
    string is non-canonical (not one of English / Traditional Chinese / Traditional
    Chinese (Hong Kong) / Simplified Chinese, nor a deliberate "Other"), note it and
    point at `/never-stale:update` to normalize. Also informational only.
  - **Drift pairs (`syncPairs`)** — if the marker declares `syncPairs`, show a
    **resolution preview** for each pair so a misconfiguration is visible rather than
    silent (the gate ignores a pair it cannot resolve). For each `{ source, snapshot,
    mode }`:
    - resolve both paths relative to `<GOV>`; flag any that is **unsafe** (absolute /
      drive-qualified / UNC / parent-escaping `..`) or **missing on disk** — the gate
      silently skips those;
    - for `mode: "mtime"` (the default), read both files' mtimes and state the verdict:
      **drift** (source newer than snapshot → "snapshot may be behind, verify") or
      **clean** (snapshot at least as new);
    - for `mode: "hash"` (v0.10.0+), read the snapshot's synced-to marker
      (`<!-- never-stale:synced-to <hex> -->`) and the source's current normalized hash,
      then state the verdict: **drift** (the marker is not a prefix of the current source
      hash → "snapshot recorded `<declared>`, source is now `<current>`; reconcile and
      update the marker"), **clean** (they match), or **unknown** (no synced-to marker in
      the snapshot, or the source is missing / larger than the 512 KB cap — the gate
      skips these silently, so surfacing them here is the whole point);
    - for `mode` of `declared` / `version`, note it is **reserved / not yet active** —
      the gate treats it as a no-op for now.

    Mtimes (epoch seconds) for an `mtime`-mode verdict:
    ```
    node -e "const fs=require('fs');for(const f of process.argv.slice(1)){try{process.stdout.write(f+' '+Math.round(fs.statSync(f).mtimeMs/1000)+'\n')}catch{process.stdout.write(f+' MISSING\n')}}" "<GOV>/<source>" "<GOV>/<snapshot>"
    ```

    Hashes for a `hash`-mode verdict — the source's current normalized hash and the
    snapshot's declared synced-to marker (compare: the declared value should be a prefix
    of the source hash):
    ```
    node -e "const fs=require('fs'),c=require('crypto');const tr=s=>{let e=s.length;while(e>0&&(s.charCodeAt(e-1)===32||s.charCodeAt(e-1)===9))e--;return s.slice(0,e)};const n=t=>{const L=t.replace(/\r\n/g,'\n').split('\n').map(tr).join('\n');let a=0,b=L.length;while(a<b&&L.charCodeAt(a)===10)a++;while(b>a&&L.charCodeAt(b-1)===10)b--;return L.slice(a,b)};const src=process.argv[1],snap=process.argv[2];try{process.stdout.write('source '+c.createHash('sha256').update(n(fs.readFileSync(src,'utf8'))).digest('hex').slice(0,16)+'\n')}catch{process.stdout.write('source MISSING\n')}try{const m=/never-stale:synced-to\s+([0-9a-fA-F]{8,64})/.exec(fs.readFileSync(snap,'utf8'));process.stdout.write('snapshot synced-to '+(m?m[1]:'(no marker)')+'\n')}catch{process.stdout.write('snapshot MISSING\n')}" "<GOV>/<source>" "<GOV>/<snapshot>"
    ```
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
languages (+ codes), per-event flags, version drift vs the installed plugin (and that
it is cosmetic), any `syncPairs` and their per-pair resolution/verdict (drift / clean /
unresolved-and-skipped), the CLAUDE.md fence state (intact / edited / missing /
malformed), any legacy residue, and the one-line verdict (fires / silent, and why). Point to the next
action: `/never-stale:setup` (opt in), `/never-stale:on` / `/never-stale:off` (resume /
pause), `/never-stale:update` (reconcile version + language codes), or
`/never-stale:remove` (delete). Write nothing.
