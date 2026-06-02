# Security Policy

never-stale runs entirely locally as a Node hook. It makes **no network calls** and
collects **no telemetry**. Its footprint in a project is two inert files (a marker and
a `CLAUDE.md` block); the executable code lives only in the installed plugin.

## Reporting a vulnerability

Please report security issues **privately**, not in a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/biznuts/never-stale/security/advisories/new)
  for this repository (Security → Report a vulnerability), or
- open a minimal public issue asking for a private contact channel **without**
  disclosing details.

Please include the plugin version (from `/plugin` or
`never-stale/.claude-plugin/plugin.json`), your OS, and the smallest reproduction you
can manage. We will acknowledge the report and work with you on a fix and disclosure
timeline.

## Supported versions

Only the latest release is supported. Update with `/plugin marketplace update biznuts`
then `/plugin install never-stale@biznuts`.

## Scope notes

The gate is designed to **fail safe**: on any error or ambiguity it exits silently and
emits nothing, so a malformed marker or payload results in "no reminder" rather than
unintended behavior. A report showing the gate firing in a project that was never
opted in, or acting on a path outside the resolved project, is considered a security
bug.
