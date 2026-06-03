---
description: Reconcile opted-in projects to the installed never-stale version after you upgrade the plugin — bump each marker's recorded version, normalize the recorded languages to canonical display strings + codes, refresh the CLAUDE.md fence version tag, and migrate away any legacy v0.5.0 residue. Cosmetic/bookkeeping only (the gate ignores the version and the language strings); it never re-asks your languages and never changes the gate's behavior. Shows a per-project plan and confirms first.
argument-hint: "[optional search root path; defaults to cwd] [--dry-run]"
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# never-stale — reconcile after a plugin upgrade

When you upgrade the plugin, projects you opted into earlier keep markers and
`CLAUDE.md` fences stamped with the version that wrote them. The gate does **not**
read those stamps (it only checks `enabled` and the per-event flags), so this drift is
purely cosmetic — but it makes `/never-stale:status` / `:list` noisy and lets the
recorded language strings drift apart (e.g. "Traditional Chinese (HK)" vs
"Traditional Chinese (Hong Kong)"). `update` sweeps your projects and reconciles that
bookkeeping in one pass. It **never** re-asks your languages and **never** changes
whether or what the gate fires.

> This is bookkeeping, not behavior. If markers reading an older version do not bother
> you, you do not need to run this at all.

**Search root** = the path in `$ARGUMENTS` (ignoring any flag) if given, else the
current working directory. Call it `<ROOT>`. For a real post-upgrade sweep, pass the
parent that holds your repos (e.g. a path like `X:/projects`); the default cwd only
reconciles the project you are in.

**Dry-run.** If `$ARGUMENTS` contains `--dry-run`, only print the plan, then STOP
without writing anything.

## Step 0 — Determine the installed plugin version

Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and take its `version`. Call it
`<PV>` (the target every reconciled marker/fence is stamped to). If you cannot resolve
`${CLAUDE_PLUGIN_ROOT}`, find never-stale under your Claude plugins cache and read its
`plugin.json`; if still unknown, ask the user for the installed version rather than
guessing.

## Step 1 — Discover opted-in / legacy projects

Use Glob under `<ROOT>`:

- `**/.claude/never-stale.json` and `**/.claude/never-stale.local.json` — current
  markers;
- `**/.claude/hooks/never-stale-reminder.js` — legacy v0.5.0 installs.

For each project directory, read the marker(s). If both a team and a local marker
exist at the same project, treat the **local** one as effective (it overrides), but
report both — reconcile each file that needs it.

## Step 2 — Build a per-project reconcile plan

For each marker, decide each field's action. Do **not** decide from chat memory —
read the files.

- **version** — if `version` !== `<PV>` (or absent) → set to `<PV>`.
- **languages → canonical display + code.** For `spoken` and `written`, map the
  recorded display string to the canonical pair below (case-insensitive,
  substring/keyword match). Set the display string to the canonical label and add the
  matching `spokenCode` / `writtenCode`:

  | Canonical display | Code | Matches (any of) |
  |---|---|---|
  | English | `en` | english, `en` |
  | Traditional Chinese | `zh-Hant` | traditional (without HK), 繁, zh-Hant |
  | Traditional Chinese (Hong Kong) | `zh-HK` | hong kong, (hk), 香港, zh-HK |
  | Simplified Chinese | `zh-Hans` | simplified, 简, zh-Hans |

  Check the Hong Kong row **before** the plain Traditional row (HK is more specific).
  If a string matches none (a genuine "Other" language) → **leave the display string
  as-is, omit the code**, and flag it as non-canonical (left untouched). Never coerce
  an Other language into a canonical bucket.
  - already canonical with the right code → SKIP that field.
  - canonical display but missing code → ADD the code.
  - a variant (e.g. "Traditional Chinese (HK)") → NORMALIZE display + ADD code.
- **CLAUDE.md fence** — locate the `<!-- never-stale:begin v=… hash=… -->` /
  `<!-- never-stale:end -->` pair in `<GOV>/CLAUDE.md`.
  - well-formed and `v=` !== `<PV>` → **bump `v=` to `<PV>` only.** Do **not** touch
    the body or the `hash=`: the recorded hash is the scaffold-time body hash, and
    leaving it preserves the "edited since scaffold" signal that `/never-stale:status`
    relies on. (This release does not change the template body, so an intact fence
    stays intact.)
  - `v=` already `<PV>` → SKIP.
  - missing / malformed (unmatched or nested sentinels) → do **not** edit; flag for
    manual review (point at `/never-stale:setup` to rescaffold or `/never-stale:status`
    to inspect).
- **Legacy v0.5.0 residue** — `…/.claude/hooks/never-stale-reminder.js` and any
  `settings.json` hook whose `command` contains `never-stale-reminder.js` → plan to
  REMOVE (the migration teardown, identical to setup's Step 4b). Never edit
  `settings.local.json`; flag a legacy hook there for manual removal.

## Step 3 — Show the plan and confirm

Print one block per project, one line per field, e.g.:

```
X:/projects/mark-tech1
  marker version        0.6.0 → 0.8.0
  spoken                "Traditional Chinese (HK)" → "Traditional Chinese (Hong Kong)" (zh-HK)
  written               "English" (en)  [add code]
  CLAUDE.md fence v=     0.6.0 → 0.8.0  (body untouched)
X:/projects/some-app
  spoken                "Klingon"  [Other — left as-is]
  CLAUDE.md fence        MALFORMED — manual review (begin without end @ line 12)
```

- If `$ARGUMENTS` has `--dry-run`: stop here, write nothing.
- If nothing needs reconciling: say everything is already current, stop.
- Otherwise confirm via **AskUserQuestion**: **Reconcile all** / **Cancel**. (Edited
  fences and Other languages are surfaced but never block — edited bodies are left
  untouched.) Apply only after a yes.

## Step 4 — Apply (minimal edits)

For each approved project: edit the marker fields (version, display strings, add
codes) and the CLAUDE.md `v=` tag in place; remove approved legacy residue (delete the
script; in `settings.json` only, drop the never-stale hook objects and prune emptied
containers to — not below — `{}`). Do not reorder or reformat untouched fields, do not
touch the fence body or `hash=`, and never modify `settings.local.json`.

## Step 5 — Report

Tell the user (in their spoken language): how many projects were scanned and how many
reconciled; per project, what changed (version, normalized languages + codes added,
fence `v=` bumped, legacy removed); which were skipped (already current), flagged
(malformed fence), or left as-is (Other language). Reiterate that this was **cosmetic
bookkeeping** — the gate's behavior is unchanged, nothing needs a restart, and markers
that still read an older version would have worked fine regardless.
