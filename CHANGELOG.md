# Changelog

All notable changes to **never-stale** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The installed version is the `version` field in
[`never-stale/.claude-plugin/plugin.json`](never-stale/.claude-plugin/plugin.json).

## [0.8.0] - 2026-06-03

### Added
- **`/never-stale:update`** — reconcile opted-in projects to the installed plugin
  version after an upgrade: bumps each marker's recorded `version`, normalizes the
  recorded languages to canonical display strings, adds language codes, refreshes the
  `CLAUDE.md` fence `v=` tag (leaving the body and `hash=` untouched), and migrates
  away legacy v0.5.0 residue. Bookkeeping only — it never re-asks your languages and
  never changes the gate's behavior (the gate ignores the version and the language
  strings). Shows a per-project plan and confirms; `--dry-run` previews.
- **Canonical language codes.** The marker gains optional `spokenCode` / `writtenCode`
  (`en`, `zh-Hant`, `zh-HK`, `zh-Hans`; omitted for an "Other" language) alongside the
  human display strings, so a recorded language stays comparable even when the display
  wording drifts (e.g. "Traditional Chinese (HK)" vs "Traditional Chinese (Hong
  Kong)"). `setup` writes them; `update` backfills them on older markers.
- **Version-drift surfacing** in `/never-stale:status` and `/never-stale:list`: each
  compares a marker's recorded `version` against the installed plugin version and flags
  a stale marker — making clear it is cosmetic and pointing at `/never-stale:update`.

### Changed
- `marker.schema.json` adds the optional `spokenCode` / `writtenCode` string properties
  (documented with the canonical values). Existing markers without them remain valid;
  no migration is required.

## [0.7.0] - 2026-06-03

### Added
- **Verb subcommands.** `/never-stale` is now driven by verbs instead of one
  flag-laden command: `/never-stale:setup`, `/never-stale:off`, `/never-stale:on`,
  `/never-stale:status`, `/never-stale:list`, and `/never-stale:remove`. Each carries
  its own `description`, so natural-language invocation resolves the right action.
- **Reversible pause/resume** — `/never-stale:off` flips the marker to
  `"enabled": false` (silencing the gate) while **keeping** the marker, the recorded
  languages, and the `CLAUDE.md` block; `/never-stale:on` flips it back. On a committed
  team marker, `off` offers to drop a *local* `"enabled": false` override instead, so a
  single checkout can pause without changing the repo.
- **`/never-stale:status`** — a read-only health check: which marker governs the
  project (team vs local), its enabled state, the recorded languages and per-event
  flags, the `CLAUDE.md` fence state (intact / edited since scaffold / missing /
  malformed), and the one-line "fires vs silent" verdict.
- Continuous integration (`.github/workflows/ci.yml`): syntax-checks the gate,
  validates every shipped JSON file, confirms the plugin/marketplace entry, and runs
  the full test suite on every push and pull request. The workflow token is pinned to
  least privilege (`contents: read`) and the actions run on the Node 24 runtime.
- A dependency-free gate test suite (`test/gate.test.mjs`) covering fire/silent
  behavior, the upward marker walk, disabled/corrupt markers, out-of-project edits,
  per-event opt-outs, and the fail-safe contract.
- A marker conformance suite (`test/marker.schema.test.mjs`): a zero-dependency,
  schema-driven validator exercised with valid *and* invalid fixtures, which also
  asserts the repo's committed marker conforms to `marker.schema.json`.
- Community files and a value-first README revamp with demo images: `CHANGELOG`,
  `CONTRIBUTING`, `SECURITY`, and issue/PR templates.
- The repository now **dogfoods** never-stale on itself — a committed marker
  (`.claude/never-stale.json`) plus a sentinel-fenced `CLAUDE.md`.

### Changed
- The old flags map to verbs: `/never-stale` → `/never-stale:setup`,
  `/never-stale --off` → `/never-stale:remove` (the destructive teardown),
  `/never-stale --list` → `/never-stale:list`, `/never-stale --dry-run` →
  `/never-stale:setup --dry-run` (or `/never-stale:status` to inspect). The marker and
  `CLAUDE.md` formats are unchanged, and the gate is untouched — `"enabled": false` was
  already honored — so existing setups keep working without migration.

### Deprecated
- The bare `/never-stale` command. It now prints a help screen that lists the verbs
  and maps the old flags; it no longer performs setup or teardown itself.

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

[0.8.0]: https://github.com/biznuts/never-stale/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/biznuts/never-stale/compare/a3bff08...v0.7.0
[0.6.0]: https://github.com/biznuts/never-stale/compare/8947de7...a3bff08
[0.5.0]: https://github.com/biznuts/never-stale/compare/e1a5bf2...8947de7
[0.4.2]: https://github.com/biznuts/never-stale/compare/0eeb9df...e1a5bf2
[0.4.1]: https://github.com/biznuts/never-stale/compare/a1088af...0eeb9df
[0.4.0]: https://github.com/biznuts/never-stale/compare/a4f6648...a1088af
[0.3.0]: https://github.com/biznuts/never-stale/compare/f751896...a4f6648
[0.2.0]: https://github.com/biznuts/never-stale/compare/c1770c1...f751896
[0.1.0]: https://github.com/biznuts/never-stale/commit/c1770c1
