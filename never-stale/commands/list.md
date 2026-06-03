---
description: List every project on disk that is opted into never-stale (or carries legacy v0.5.0 residue) under a search root — so you can audit what is enabled, or find every install before uninstalling the plugin. Read-only: writes nothing.
argument-hint: "[optional search root path; defaults to cwd]"
allowed-tools: Read, Glob
---

# never-stale — list opted-in projects

Enumerate every project on disk that is opted into never-stale (or carries legacy
residue), so the user can find them all before uninstalling the plugin or to audit
what is enabled. This command is **read-only** — it writes nothing.

- Determine a search root: the path in `$ARGUMENTS` if given, else the current working
  directory. Call it `<ROOT>`.
- Read the **installed plugin version** from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`
  (`version`); call it `<PV>`. (If it cannot be resolved, omit the drift column.)
- Use Glob to find, under that root:
  - `**/.claude/never-stale.json` and `**/.claude/never-stale.local.json` (current
    opt-in markers);
  - `**/.claude/hooks/never-stale-reminder.js` (legacy v0.5.0 installs to migrate or
    remove).
- For each match, read the marker (if any) and report: the project root, the scope
  (team/local), `enabled` state, recorded languages, the marker `version`, and whether
  it is current (marker) or legacy (reminder script). Group current vs legacy. Flag any
  marker whose `version` !== `<PV>` as **stale** (cosmetic — the gate ignores the
  version; `/never-stale:update` reconciles it), and note markers missing language
  codes or using a non-canonical language string.
- Write nothing. End by reminding the user (in their spoken language) that, in any
  listed project, they can:
  - `/never-stale:off` to pause it (reversible) or `/never-stale:on` to resume,
  - `/never-stale:update` to reconcile stale versions + language codes across projects,
  - `/never-stale:remove` to delete the setup entirely,
  - `/never-stale:status` to inspect one project in detail;

  and that `/plugin uninstall never-stale@biznuts` removes the hooks machine-wide,
  leaving only the inert markers + CLAUDE.md prose (which `/never-stale:remove`
  clears per project).
