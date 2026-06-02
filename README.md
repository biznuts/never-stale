# never-stale

> Keep your project's **docs, language, and conventions in sync** through the whole
> session — and surviving auto-compact. A Claude Code plugin.

The problem: in a long Claude Code session, the assistant quietly drifts. It forgets
to update the docs after a change, forgets which language you wanted, and after an
**auto-compact** it loses the rules you set at the top of the conversation.

`never-stale` fixes that without you having to repeat yourself. Run one command in a
project and it installs a small, durable setup that keeps the rules in front of the
assistant — including right after every compaction.

## What it does

Running `/never-stale` in a project scaffolds three things:

1. **`CLAUDE.md`** — your project rules (auto-loaded every session, survives compaction):
   - the language for spoken replies,
   - the default language for written files,
   - "after any code change, sync the related docs."
2. **A `SessionStart` (compact) hook** — re-injects the rules right after an
   auto-compact, so the assistant doesn't "forget" mid-session.
3. **A `PostToolUse` (Edit/Write) hook** — nudges the assistant to sync docs every
   time a file changes.

The hooks run via **Node** (which Claude Code already requires), so the same setup
works on **Windows, macOS, and Linux** — no shell-specific scripts, no encoding
pitfalls.

## Install

```text
/plugin marketplace add biznuts/never-stale
/plugin install never-stale@biznuts
```

Then, in any project you want to keep in sync:

```text
/never-stale
```

It asks your language preferences, **shows you a plan** of exactly what it will
create / merge / skip, and waits for your confirmation before writing anything.
Then it scaffolds the files and asks you to **restart Claude Code** so the hooks
load. `/hooks` will show them registered.

Want to look before you leap? Run `/never-stale --dry-run` to print the plan and
stop — nothing is written.

### Removing it from a project

`/never-stale` and `/never-stale --off` are a toggle — opt a project in, opt it
out. Teardown removes **only** never-stale's own footprint (its hook script, its
hooks in `settings.json`, and the `CLAUDE.md` sections it wrote that you haven't
edited); it leaves your own content and `settings.local.json` untouched, shows a
removal plan, and asks before deleting:

```text
/never-stale --off            # plan, confirm, then remove
/never-stale --off --dry-run  # just show what would be removed
```

This is per-project. The plugin itself stays installed machine-wide — remove that
with `/plugin uninstall never-stale@biznuts`.

## Updating

New versions don't apply by themselves — installed plugins are pinned to the
version you installed. To pull a newer release:

```text
/plugin marketplace update biznuts
/plugin install never-stale@biznuts
```

Then **restart Claude Code** (or run `/reload-plugins`) so the new command and
hooks load. To see which version you have, open `/plugin` and find never-stale in
the list.

> Already set up a project with an older version? Re-running `/never-stale` there
> is safe — it detects what exists and skips/updates instead of duplicating.

## How it works

| Piece | Mechanism | Why it survives compaction |
|-------|-----------|----------------------------|
| Rules | `CLAUDE.md` | Loaded into context every session, re-injected after compaction |
| Compact reminder | `SessionStart` hook, matcher `compact` | Fires right after auto-compact |
| Doc-sync reminder | `PostToolUse` hook, matcher `Edit\|Write\|MultiEdit` | Fires after each file change, emitted as `additionalContext` JSON |

The reminders point back to `CLAUDE.md` (the single source of truth), so changing
the language or rules later just means editing that file.

## Design notes

- **Per-project, opt-in.** Nothing is global. The plugin only ships the
  `/never-stale` command; it does not impose anything on any project automatically.
  Run the command where you want it; other projects are untouched.
- **Dry-run by default.** Every run inspects the project first and shows a plan
  (create / merge / update / skip) for your approval before touching a file. Pass
  `--dry-run` to preview only and write nothing.
- **Idempotent, with real conflict detection.** Re-running merges/updates instead
  of duplicating. It detects its own hooks by their command
  (`never-stale-reminder.js`) — across **both** `settings.json` and
  `settings.local.json` — and skips them on a re-run. If it finds a *foreign* hook
  on the same event (in either file), or a `CLAUDE.md` that already states its own
  language / doc / post-compact rule, it surfaces the conflict in the plan and
  makes you **resolve it before anything is written** (apply anyway / skip that
  piece / cancel).
- **Configurable language.** The command asks for your spoken-reply language and
  your written-file default language at scaffold time (both default to English).
- **Reversible.** `/never-stale --off` is a symmetric teardown: it removes only
  never-stale's own artifacts (with the same plan-and-confirm safety), leaving your
  content and `settings.local.json` alone.

## Requirements

- Claude Code with plugin support.
- Node.js on `PATH` (Claude Code already needs it).

## License

MIT — see [LICENSE](LICENSE).
