# never-stale

> Keep your project's **docs, language, and conventions in sync** through the whole
> session — and surviving auto-compact. A Claude Code plugin.

The problem: in a long Claude Code session, the assistant quietly drifts. It forgets
to update the docs after a change, forgets which language you wanted, and after an
**auto-compact** it loses the rules you set at the top of the conversation.

`never-stale` fixes that without you having to repeat yourself. Run one command in a
project and it opts that project in; the plugin's hooks keep the rules in front of
the assistant — including right after every compaction.

## What it does

The plugin ships two hooks (a `SessionStart`/`compact` reminder and a
`PostToolUse`/`Edit|Write|MultiEdit` doc-sync nudge) **inside the plugin itself**.
Once installed they are registered machine-wide, but they only **act** in a project
you opted into. The switch is a tiny **marker file**.

Running `/never-stale` in a project writes just two project-owned things:

1. **A `CLAUDE.md` rules block** (wrapped in `<!-- never-stale:begin … end -->`
   sentinels), auto-loaded every session and re-injected after compaction:
   - the language for spoken replies,
   - the default language for written files,
   - "after any code change, sync the related docs."
2. **An opt-in marker** — `.claude/never-stale.json` (committed, team-shared) or
   `.claude/never-stale.local.json` (gitignored, just this machine). Its presence,
   with `"enabled": true`, is what tells the plugin's hooks to act here.

No hook and no script are written into your project. The reminders are produced by
the plugin-owned gate script, which runs in every session but **self-gates** on the
marker: no marker → it exits silently, so projects you never opted into are
untouched.

The hooks run via **Node** (which Claude Code already requires), so the same setup
works on **Windows, macOS, and Linux** — no shell-specific scripts, no encoding
pitfalls.

## Install

```text
/plugin marketplace add biznuts/never-stale
/plugin install never-stale@biznuts
```

Installing changes nothing observable on its own — the gate runs in every session
but stays silent until a project has a marker. Then, in any project you want to keep
in sync:

```text
/never-stale
```

It asks your language preferences and whether to opt the project in for the **whole
team** (committed marker) or **just this machine** (gitignored marker), **shows you a
plan** of exactly what it will write, and waits for your confirmation. Because the
hooks already ship with the plugin, you usually **don't need to restart** — the new
marker arms them for the next session immediately.

Want to look before you leap? Run `/never-stale --dry-run` to print the plan and
stop — nothing is written.

### Team vs local opt-in

- **Whole team** → `.claude/never-stale.json` is committed. Anyone on the team who
  has the plugin installed gets the reminders in this repo after they pull. (The
  opt-in travels with the repo — an intentional team decision.)
- **Just this machine** → `.claude/never-stale.local.json` is gitignored; only your
  checkout is opted in.
- A **local marker overrides a committed one**, so a teammate who doesn't want the
  reminders can run `/never-stale --off` (or set `"enabled": false` in a local
  marker) to veto an inherited team opt-in, without changing the repo.

### Removing it from a project

`/never-stale` and `/never-stale --off` are a toggle. Teardown deletes the marker
(disarming the gate for new sessions immediately) and removes the sentinel-fenced
`CLAUDE.md` block — **reliably, even if you edited the text inside the fence**,
because removal keys off the sentinels, not a byte-for-byte template match. It shows
a plan and asks first:

```text
/never-stale --off            # plan, confirm, then remove
/never-stale --off --dry-run  # just show what would be removed
```

Forgot which projects you enabled? `/never-stale --list` globs your disk for markers
(and legacy installs) and lists every opted-in project.

This is per-project. The plugin itself stays installed machine-wide — remove that
with `/plugin uninstall never-stale@biznuts`, which removes **every** hook in one
step (see *Lifecycle* below).

## Updating

New versions don't apply by themselves — installed plugins are pinned to the version
you installed. To pull a newer release:

```text
/plugin marketplace update biznuts
/plugin install never-stale@biznuts
```

Then **restart Claude Code** (or run `/reload-plugins`) so the new command and hooks
load. To see which version you have, open `/plugin` and find never-stale in the list.

### Upgrading from 0.5.0

0.5.0 wrote a script and two hooks into each project's `.claude/settings.json`.
0.6.0 moves the hooks into the plugin and gates them on a marker. The upgrade is
safe and gradual:

- Upgrading the plugin alone changes **nothing observable**: a not-yet-migrated
  0.5.0 project has no marker, so the new plugin gate stays silent there, while the
  old project-local hook keeps working exactly as before. **No double reminders.**
- The next time you run `/never-stale` in such a project, it detects the legacy
  script + settings hooks, removes them, wraps the existing `CLAUDE.md` sections in
  a sentinel fence (keeping your text), and writes a marker. After a restart the
  project runs purely on the plugin-owned, marker-gated hook.
- Never migrate a project? Its self-contained 0.5.0 setup keeps working. Use
  `/never-stale --list` to find old installs and `/never-stale --off` to clean them.

## How it works

| Piece | Mechanism | Why it survives compaction |
|-------|-----------|----------------------------|
| Rules | `CLAUDE.md` (sentinel-fenced) | Loaded into context every session, re-injected after compaction |
| Compact reminder | Plugin `SessionStart` hook, matcher `compact` | Fires right after auto-compact — in opted-in projects only |
| Doc-sync reminder | Plugin `PostToolUse` hook, matcher `Edit\|Write\|MultiEdit` | Fires after each file change, emitted as `additionalContext` JSON; path-gated to edits inside the project |
| Per-project gate | `.claude/never-stale.json` / `.local.json` marker, read at runtime | The machine-wide hook acts only where a marker with `enabled:true` exists |

`${CLAUDE_PROJECT_DIR}` (and the stdin `cwd`) is the directory Claude Code was
*launched* from — often a subdirectory of the project. So the gate walks **up** from
there to the nearest ancestor carrying a marker (nearest-ancestor-wins, like
`.editorconfig` / `.gitignore`), bounded by the **git repo root** so a marker outside
the repo can never govern it. This means launching from a subdirectory still works, a
marker at a monorepo root covers everything below it, and a subtree can opt out with
its own `"enabled": false` marker — while a true sibling subtree (never an ancestor of
where you are) is never touched. The reminders point back to `CLAUDE.md` (the single
source of truth), so changing the language or rules later just means editing that file.

## Lifecycle

- **Install the plugin** → hooks register machine-wide but stay silent everywhere
  (no markers yet).
- **`/never-stale`** in a project → writes a marker + a `CLAUDE.md` block; the hooks
  now act there.
- **`/never-stale --off`** → deletes the marker and the fenced block; the project
  goes silent again.
- **`/plugin uninstall never-stale@biznuts`** → removes the plugin's hooks and
  script **machine-wide, atomically**. Every project instantly stops firing, with no
  per-project hook surgery.

This is symmetric **for execution**: uninstalling leaves **zero executable code** in
any project. What can remain after a bare uninstall is inert data — the marker JSON
(nothing reads it once the gate is gone) and the sentinel-fenced rules in your
`CLAUDE.md` (your own project prose). To purge that too, run `/never-stale --off` in
each project first (use `/never-stale --list` to find them all).

## Design notes

- **Per-project, opt-in.** The plugin's hooks run everywhere but act nowhere until a
  project carries a marker. `/never-stale` is how you opt a project in; nothing is
  imposed on a project automatically. (For the committed-marker tier, the opt-in is a
  team decision that travels with the repo; a local marker lets any machine opt out.)
- **Dry-run by default.** Every run inspects the project first and shows a plan for
  your approval before touching a file. Pass `--dry-run` to preview only.
- **Idempotent, with real conflict detection.** Re-running merges/updates instead of
  duplicating. If it finds a `CLAUDE.md` that already states its own language / doc /
  post-compact rule under a different structure, it surfaces the conflict and makes
  you resolve it before writing.
- **Configurable language.** The command asks for your spoken-reply and written-file
  default languages at scaffold time (both default to English).
- **Reliable, symmetric teardown.** Hooks live in the plugin, so `/plugin uninstall`
  removes them everywhere with no per-project residue of executable code. `--off`
  removes a project's marker and its sentinel-fenced block reliably — even after you
  edit the block — because removal keys off the sentinels, not a byte match.

## Requirements

- Claude Code with plugin support.
- Node.js on `PATH` (Claude Code already needs it).

## Troubleshooting

Reminders not firing in a project you opted into? Set `NEVER_STALE_DEBUG=1` in the
environment before launching Claude Code; the gate then appends one JSON diagnostic
line per invocation to `never-stale-debug.log` in your OS temp directory (resolved
start dir, the project root it walked up to, whether a marker was found, and the
fire/silent decision). It is off by default and never changes behavior.

## License

MIT — see [LICENSE](LICENSE).
