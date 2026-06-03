# Contributing to never-stale

Thanks for taking the time to help! never-stale is a small, focused plugin — bug
reports, doc fixes, and well-scoped features are all welcome.

## Repository layout

```
.
├── .claude-plugin/marketplace.json   # marketplace manifest (this repo is also a marketplace)
├── README.md  CHANGELOG.md  LICENSE
├── assets/                           # README hero image
├── docs/                             # extra docs (e.g. recording a demo)
└── never-stale/                      # the plugin itself
    ├── .claude-plugin/plugin.json    # name, version, keywords  ← bump version on release
    ├── commands/                     # one file per verb subcommand
    │   ├── setup.md                  # /never-stale:setup   — opt in (scaffold + marker)
    │   ├── off.md  on.md             # /never-stale:off|on  — reversible pause / resume
    │   ├── remove.md                 # /never-stale:remove  — full teardown
    │   ├── list.md  status.md        # /never-stale:list|status — read-only
    │   └── never-stale.md            # deprecated bare command → prints help
    ├── hooks/hooks.json              # machine-wide hook registration
    ├── hooks/never-stale-gate.js     # the gate: runs everywhere, acts only via a marker
    └── marker.schema.json            # JSON Schema for the opt-in marker
```

The single most important invariant: **the gate runs in every session but must only
*act* where an opt-in marker exists**, and it must **never throw, never exit non-zero,
and never write to stderr**. When in doubt it exits silently. A change that risks
firing in a project the user did not opt into is a bug, full stop.

## Developing locally (no publishing required)

Load the local plugin directly, without installing from the marketplace:

```text
claude --plugin-dir /absolute/path/to/never-stale/never-stale
```

`never-stale-gate.js` is re-read on every hook invocation, so edits to the gate take
effect without a reinstall (run `/reload-plugins` if you change `hooks.json`,
`commands/`, or `plugin.json`).

## Testing the gate

Run the automated suite (no dependencies — Node's built-in test runner):

```bash
node --test test/*.test.mjs
```

The suite has two parts:

- **`gate.test.mjs`** builds throwaway fixture repos under your temp directory and
  asserts the gate's fire/silent behavior: an enabled marker, the upward walk from a
  subdirectory, a disabled or corrupt marker, an out-of-project edit, the per-event
  opt-outs, and the fail-safe contract (exit 0, nothing on stderr).
- **`marker.schema.test.mjs`** checks markers against `marker.schema.json` using a
  schema-driven (zero-dependency) validator, with valid *and* invalid fixtures, and
  confirms the repo's own committed marker conforms.

The same suite runs in CI (`.github/workflows/ci.yml`) on every push and pull request,
alongside a JSON-validity check of every shipped file.

To exercise the gate by hand, it reads its payload on stdin and uses
`CLAUDE_PROJECT_DIR` (falling back to the stdin `cwd`) as the *start* directory, from
which it walks up to the nearest marker:

```bash
GATE=never-stale/hooks/never-stale-gate.js

# fires (project has an enabled marker at or above $PWD, within the repo)
printf '%s' '{"cwd":"'"$PWD"'"}' | CLAUDE_PROJECT_DIR="$PWD" node "$GATE" compact

# fires from a subdirectory too (upward walk)
printf '%s' '{"cwd":"'"$PWD"'/some/sub"}' | CLAUDE_PROJECT_DIR="$PWD/some/sub" node "$GATE" compact

# silent: an edit to a file outside the project, or no marker up to the repo root
printf '%s' '{"cwd":"'"$PWD"'","tool_input":{"file_path":"/elsewhere/x"}}' | CLAUDE_PROJECT_DIR="$PWD" node "$GATE" edit
```

A firing run prints a `{"hookSpecificOutput":{…}}` JSON line; a silent run prints
nothing. Set `NEVER_STALE_DEBUG=1` to append a diagnostic line (resolved start dir,
marker presence, decision) to `never-stale-debug.log` in your OS temp directory.

When you change a command, verify the round trip end-to-end in a scratch project:
`/never-stale:setup` writes the marker + sentinel-fenced `CLAUDE.md`; `/never-stale:off`
flips the marker to `enabled:false` (and `/never-stale:on` back) without deleting
anything; `/never-stale:status` reports the state read-only; and `/never-stale:remove`
removes the marker + fenced block cleanly.

## Coding conventions

- The hooks are **Node**, no dependencies, cross-platform (Windows/macOS/Linux). Don't
  introduce shell-specific scripts or npm dependencies.
- Keep the gate's fail-safe contract (above) intact, with a top-level `try/catch`
  backstop.
- Written files (docs, code comments, commit messages) are in **English**.
- Match the existing style; keep changes surgical.

## Submitting changes

1. Open an issue first for anything beyond a small fix, so we can agree on scope.
2. Keep PRs focused; update `README.md` and `CHANGELOG.md` in the same PR when behavior
   changes.
3. Describe how you tested (the gate cases above, and an end-to-end `/never-stale` run).

## Releasing (maintainers)

1. Bump `version` in `never-stale/.claude-plugin/plugin.json` — **a release with no
   version bump has no effect** for users pulling updates.
2. Update `CHANGELOG.md` (new version section + the compare link at the bottom).
3. Update `README.md` / `marketplace.json` descriptions if the pitch changed.
4. Commit, tag (`vX.Y.Z`), and push to `main`.
5. Users update with `/plugin marketplace update biznuts` then
   `/plugin install never-stale@biznuts` and a restart (or `/reload-plugins`).
