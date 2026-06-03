---
description: never-stale overview / help. Deprecated entry point — the command is now split into verb subcommands. Prints the list of verbs and what each does, and maps the old flags (--off / --list / --dry-run) to their new verb. Does not modify anything.
argument-hint: "[--off | --list | --dry-run] (deprecated — see the verbs below)"
allowed-tools: Read
---

# never-stale — command overview

As of **v0.7.0**, never-stale is driven by **verb subcommands** instead of one command
with flags. This bare `never-stale` command is **deprecated** and now just prints this
help; it changes nothing. Run one of the verbs below directly.

> Why the change: a single `/never-stale` that meant "set up" but also carried
> `--off`, `--list`, and `--dry-run` was confusing — and because Claude Code namespaces
> plugin commands, it had to be typed `/never-stale:never-stale`. Verb subcommands read
> as plain actions: `/never-stale:setup`, `/never-stale:off`, and so on.

## The verbs

| Command | What it does |
|---|---|
| `/never-stale:setup` | Opt this project in: scaffold the `CLAUDE.md` rules + write the marker. Idempotent. Accepts `--dry-run`. |
| `/never-stale:off` | **Pause** (reversible): flip the marker to `enabled:false`. Keeps the marker, languages, and `CLAUDE.md` block. |
| `/never-stale:on` | **Resume**: flip the marker back to `enabled:true`, reusing the recorded languages. |
| `/never-stale:status` | Read-only health check of this project (marker, enabled state, languages, version drift, `CLAUDE.md` fence, would-it-fire). |
| `/never-stale:list` | List every opted-in / legacy project on disk under a search root. Read-only. |
| `/never-stale:update` | Reconcile opted-in projects to the installed version (marker version, language codes, fence `v=`) after a plugin upgrade. Cosmetic; accepts `--dry-run`. |
| `/never-stale:remove` | **Full teardown**: delete the marker and strip the `CLAUDE.md` fenced block. Accepts `--dry-run`. |

`off`/`on` are the light switch (nothing is deleted); `remove` is the uninstall
(deletes the per-project setup, re-add with `setup`).

## Migrating from the old flags

If you used the old single-command flags, here is the new equivalent:

| Old | New |
|---|---|
| `/never-stale` (no args) | `/never-stale:setup` |
| `/never-stale --dry-run` | `/never-stale:setup --dry-run` (or `/never-stale:status` to inspect) |
| `/never-stale --off` | `/never-stale:remove` (full teardown) — or `/never-stale:off` to just **pause** |
| `/never-stale --off --dry-run` | `/never-stale:remove --dry-run` |
| `/never-stale --list` | `/never-stale:list` |

> Note: the old `--off` was a **teardown**. It now maps to `/never-stale:remove`. The
> new `/never-stale:off` is a reversible **pause** instead — different, gentler
> behavior. If you want the old delete, use `remove`.

## What to do now

Look at `$ARGUMENTS`:

- If it contains `--off`, `--list`, or `--dry-run`, point the user to the matching new
  verb from the table above (quote the exact command to run) and stop. Do **not**
  perform the action from this deprecated command.
- Otherwise, briefly present the verb list above and suggest `/never-stale:setup` to
  opt this project in (or `/never-stale:status` to check the current state).

This command only prints guidance — it never writes or removes anything.
