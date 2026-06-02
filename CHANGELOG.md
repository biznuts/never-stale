# Changelog

All notable changes to **never-stale** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The installed version is the `version` field in
[`never-stale/.claude-plugin/plugin.json`](never-stale/.claude-plugin/plugin.json).

## [0.6.0] - 2026-06-02

### Changed
- **Hooks now ship inside the plugin** (`hooks/hooks.json` +
  `hooks/never-stale-gate.js`, resolved via `${CLAUDE_PLUGIN_ROOT}`) and register
  machine-wide. `/never-stale` no longer writes any hook or script into your project —
  only a marker and a `CLAUDE.md` block.
- `CLAUDE.md` rules are now wrapped in `<!-- never-stale:begin … -->` /
  `<!-- never-stale:end -->` **sentinels**, so teardown is reliable even after you edit
  the text inside.

### Added
- **Per-project opt-in marker** — `.claude/never-stale.json` (committed/team) or
  `.claude/never-stale.local.json` (gitignored/local, which overrides a committed
  marker and can veto it with `"enabled": false"`).
- **Git-bounded upward walk:** the gate resolves the governing project by walking up
  from the launch directory to the nearest ancestor marker, bounded by the git repo
  root — so launching from a subdirectory still works and a marker outside the repo
  never governs it.
- `/never-stale --list` to enumerate every opted-in (and legacy) project on disk.
- Automatic migration of 0.5.0 installs when you re-run `/never-stale`.
- `NEVER_STALE_DEBUG=1` diagnostic log in the OS temp directory.

### Removed
- The project-local `never-stale-reminder.js` script and the per-project
  `settings.json` hooks (replaced by the plugin-owned, marker-gated hook). Existing
  0.5.0 projects keep working until migrated.

## [0.5.0] - 2026-06-01

### Added
- **`/never-stale --off`** — per-project teardown that is symmetric to setup: it shows
  a plan, confirms, and removes only never-stale's own artifacts (hook script, its
  `settings.json` hooks, and `CLAUDE.md` sections still matching the template).
  `--off --dry-run` previews the removal only. Foreign hooks, user-edited sections,
  and `settings.local.json` are never touched.

## [0.4.2] - 2026-06-01

### Changed
- Renamed the marketplace to **`biznuts`**, so the install id is
  `never-stale@biznuts` (instead of the confusing `never-stale@never-stale`).

## [0.4.1] - 2026-06-01

### Added
- README "Updating" section and a note on how to check the installed version.

## [0.4.0] - 2026-05-31

### Added
- Conflict detection now reads **both** `settings.json` and `settings.local.json`.
- `CLAUDE.md` detection flags a project that already states its own language /
  doc-maintenance / post-compact rule (even under a different heading) as a *review*
  conflict the user must resolve, instead of appending a duplicate.

## [0.3.0] - 2026-05-31

### Added
- **Dry-run preview** — `/never-stale` inspects the project, builds a
  create/merge/update/skip plan, and confirms before writing (`--dry-run` previews
  only).
- Real duplicate-hook detection: skips never-stale's own hooks on re-run and flags a
  *foreign* same-event hook as a double-fire conflict before adding.

## [0.2.0] - 2026-05-31

### Changed
- The language prompt now offers a fixed, ordered list (English → Traditional Chinese
  → Traditional Chinese (Hong Kong) → Simplified Chinese, plus "Other") for both
  spoken and written defaults, instead of improvising the choices each run.

## [0.1.0] - 2026-05-31

### Added
- Initial release: cross-platform (Node) hooks for a `SessionStart`/`compact` reminder
  and a `PostToolUse`/`Edit|Write` doc-sync nudge, a parametrized-language `CLAUDE.md`
  scaffold, and idempotent setup via `/never-stale`.

[0.6.0]: https://github.com/biznuts/never-stale/compare/8947de7...a3bff08
[0.5.0]: https://github.com/biznuts/never-stale/compare/e1a5bf2...8947de7
[0.4.2]: https://github.com/biznuts/never-stale/compare/0eeb9df...e1a5bf2
[0.4.1]: https://github.com/biznuts/never-stale/compare/a1088af...0eeb9df
[0.4.0]: https://github.com/biznuts/never-stale/compare/a4f6648...a1088af
[0.3.0]: https://github.com/biznuts/never-stale/compare/f751896...a4f6648
[0.2.0]: https://github.com/biznuts/never-stale/compare/c1770c1...f751896
[0.1.0]: https://github.com/biznuts/never-stale/commit/c1770c1
