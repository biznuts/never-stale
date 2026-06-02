<!-- Thanks for contributing! Keep PRs focused. See CONTRIBUTING.md. -->

## What & why

<!-- What does this change, and what problem does it solve? Link the issue if any. -->

Closes #

## How I tested

- [ ] Ran the gate cases (compact / edit / subdirectory / outside-project / no-marker)
      — fires when expected, silent when expected.
- [ ] End-to-end: `/never-stale` in a scratch project writes the marker + sentinel-fenced
      `CLAUDE.md`; `/never-stale --off` removes them cleanly.
- [ ] (If behavior changed) updated `README.md` and `CHANGELOG.md`.
- [ ] (If releasing) bumped `version` in `never-stale/.claude-plugin/plugin.json`.

## Fail-safe check

- [ ] The gate still never throws / never exits non-zero / never writes to stderr, and
      stays silent in projects without a marker.
