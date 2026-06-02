---
name: Bug report
about: A reminder fired when it shouldn't, didn't fire when it should, or setup/teardown misbehaved
title: "[bug] "
labels: bug
---

## What happened

<!-- A clear description of the bug. -->

## What you expected

<!-- e.g. "the gate should have stayed silent — this project has no marker" -->

## Reproduction

Steps, ideally in a scratch project:

1. …
2. …

## Environment

- never-stale version (from `/plugin`, or `never-stale/.claude-plugin/plugin.json`):
- OS:
- Launched Claude Code from (project root or a subdirectory?):

## Diagnostics

Set `NEVER_STALE_DEBUG=1` before launching Claude Code and paste the relevant lines
from `never-stale-debug.log` (in your OS temp directory) — they show the resolved
start dir, the project root walked up to, marker presence, and the fire/silent
decision.

```
<paste debug lines here>
```

## Marker / CLAUDE.md (if relevant)

<!-- Contents of .claude/never-stale.json (or .local.json), and the never-stale block in CLAUDE.md. -->
