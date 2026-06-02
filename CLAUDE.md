# Project rules

<!-- never-stale:begin v=0.6.0 hash=8c2b42f56e6fd699 -->
## Language
- **Spoken replies** to the user: always **English**. Keep this unless the user explicitly asks to switch.
- **Written files** — `CLAUDE.md`, docs, specs, `README`s, code comments, commit messages: **English by default.**
- **Override:** if the user explicitly asks for a specific language for a given document, write that document in that language. An explicit request always wins over the default above.

## Doc maintenance
- After ANY code change, immediately sync the related docs (e.g. `README.md`, `CLAUDE.md`, design/spec docs). Don't wait to be asked.
- Before changing a feature, read the related docs first to confirm the current state.
- At the end of a round of changes, state clearly which docs were updated and which were not.

## Auto-compact note
- If this conversation just went through auto-compact: re-confirm the two rules above (spoken language + keep docs in sync) still apply.
- When unsure of the state, re-read this `CLAUDE.md` and the related docs; don't rely on chat memory.
<!-- never-stale:end -->

<!--
This repo dogfoods its own plugin: the marker at .claude/never-stale.json opts it
in, and the block above is what the gate reminds contributors to re-confirm after an
auto-compact. The committed default is English (this is a public project). To work in
another language without changing the repo, drop a gitignored local override at
.claude/never-stale.local.json — a local marker overrides the committed one.
-->
