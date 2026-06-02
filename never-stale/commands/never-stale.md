---
description: Make THIS project never-stale — scaffold language rules + doc-sync discipline gated by a per-project marker, driven by hooks that ship in the plugin and survive auto-compact. Cross-platform (Node). Per-project, manual trigger only; touches no other project.
argument-hint: "[optional project root path; defaults to cwd] [--off] [--list] [--dry-run]"
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# never-stale — set up this project

Goal: stop the assistant from "forgetting" project conventions mid-session — keep
docs in sync, keep language consistent, and re-confirm the rules after every
auto-compact.

## How v0.6.0 works (read this before doing anything)

The hooks **ship inside the plugin** (`hooks/hooks.json` +
`hooks/never-stale-gate.js`, resolved via `${CLAUDE_PLUGIN_ROOT}`). Once the plugin
is installed they are registered **machine-wide**, so the gate script **runs in
every session** — but it only **acts** in a project that carries an opt-in
**marker** file. Running is not acting:

- **plugin enabled** → the gate script *runs* in every session;
- **marker present** (`<ROOT>/.claude/never-stale.json` or `never-stale.local.json`
  with `enabled: true`) → the gate *acts* (emits a reminder) in that project only;
- no marker → the gate exits silently. Other projects are untouched.

To find the marker the gate walks **up** from the launch dir (`CLAUDE_PROJECT_DIR`,
falling back to the stdin `cwd`) to the nearest ancestor that carries one — so
launching from a subdirectory still works — bounded by the git repo root so a marker
outside the repo never governs it. A marker therefore covers its directory and
everything below it; a subtree can opt out with its own `"enabled": false` marker.

Therefore `/never-stale` (setup) does **not** write any hook into the project and
does **not** drop a script into the project. It only writes two project-owned
things: the **marker** (the opt-in switch) and the **CLAUDE.md** rules block. This
is what makes uninstall clean: `/plugin uninstall` removes the plugin's hooks
machine-wide, and the only per-project leftover is inert data (the marker + your own
CLAUDE.md prose), never orphaned executable code.

Be **idempotent**: if something already exists, merge/update it, never duplicate.

**Project root** = the path in `$ARGUMENTS` (ignoring any flag) if a path was given,
otherwise the current working directory. Call it `<ROOT>`. Wherever a template shows
`<ROOT>`, substitute the **real absolute path** — never write the literal `<ROOT>`.

**Mode.** Default = **set up** this project (Steps 0–6). If `$ARGUMENTS` contains
**`--off`**, run **Teardown mode** (remove never-stale's footprint from this
project). If `$ARGUMENTS` contains **`--list`**, run **List mode** (enumerate every
opted-in / legacy project on disk). Setup and `--off` are a toggle.

**Dry-run.** If `$ARGUMENTS` contains `--dry-run`, only inspect and print the plan,
then STOP without writing or removing anything. Works with every mode.

## Step 0 — Ask the user for language preferences

Use the **AskUserQuestion** tool to ask the two questions below. For **both**
questions, offer exactly these four options, **in this order** (the AskUserQuestion
tool adds an "Other" choice automatically, so the user can still type any language):

1. **English** — the default (first option)
2. **Traditional Chinese**
3. **Traditional Chinese (Hong Kong)**
4. **Simplified Chinese**

Ask:

1. **Spoken replies** — what language should the assistant talk to the user in?
   (default: **English**)
2. **Written files** — what language should newly written docs/specs/READMEs/code
   comments default to? (default: **English**)

The first option (**English**) is the default for each. Call the chosen values
`<SPOKEN>` and `<WRITTEN>`. Use them in Steps 3 and 4.

## Step 0.5 — Ask the opt-in scope (team vs just this machine)

Use **AskUserQuestion** to ask **how this project should be opted in**:

1. **Whole team (commit it)** — write `<ROOT>/.claude/never-stale.json` and let it be
   committed. Everyone who has the plugin installed gets the reminders in this repo
   after they pull. (The opt-in travels with the repo — an intentional team
   decision.)
2. **Just this machine** — write `<ROOT>/.claude/never-stale.local.json` and ensure
   it is gitignored. Nothing is committed; only this checkout is opted in.

Call the choice `<SCOPE>` (`team` or `local`). Default: **team** (most users want the
discipline shared), but make the trade-off explicit in the question.

> A local marker also **overrides** a committed one: a teammate who does not want the
> reminders can run `/never-stale --off` locally (or drop a local marker with
> `enabled: false`) to veto an inherited team opt-in, without changing the repo.

## Step 1 — Inspect the project and build a plan

Before writing anything, detect the current state of each artifact and decide its
action. Use Glob / Read.

- **Marker** — read `<ROOT>/.claude/never-stale.json` and
  `<ROOT>/.claude/never-stale.local.json` as JSON if present.
  - a marker for the chosen `<SCOPE>` already exists with `enabled: true` → **SKIP**
    (already opted in at that scope; you may still UPDATE its recorded
    `spoken`/`written` if the user picked different languages).
  - none for the chosen scope → **CREATE marker**.
- **`<ROOT>/CLAUDE.md`**
  - missing → **CREATE** (write the `# Project rules` title + the sentinel-fenced
    block).
  - exists and **already contains a `<!-- never-stale:begin … -->` … `<!-- never-stale:end -->`
    fence** → **UPDATE** inside the fence (reconcile the Language section to
    `<SPOKEN>`/`<WRITTEN>`; recompute the body hash in the begin sentinel). Never add
    a second fence.
  - exists with a plain top-level `## Language` section but **no fence** (a v0.5.0
    install) → **MIGRATE**: wrap the existing three managed sections in a fence in
    place (see Step 4b), preserving their current text.
  - exists and already states a language / doc-maintenance / post-compact rule under
    a *different* heading or structure (e.g. `### 語言`, `## Standing Rules`, a
    "source of truth" doc discipline) → **CONFLICT (review)**: the project already
    has its own convention. Do NOT blindly append — surface it in Step 2 and let the
    user resolve.
  - exists with none of the above → **MERGE** (append the sentinel-fenced block).
- **Legacy v0.5.0 residue** (for MIGRATE) — check for
  `<ROOT>/.claude/hooks/never-stale-reminder.js` and, in `<ROOT>/.claude/settings.json`
  **and** `<ROOT>/.claude/settings.local.json`, any hook whose `command` contains
  **`never-stale-reminder.js`**. If found → plan to remove them (the plugin-owned
  hook replaces them). Removal targets `settings.json` only; if a legacy hook sits in
  `settings.local.json`, do NOT edit that file — flag it for manual removal.

## Step 2 — Dry-run preview, surface conflicts, and resolve before writing

Show the plan as a short list, one line per artifact, marking each action (CREATE /
MERGE / UPDATE / MIGRATE / SKIP / CONFLICT). For every **CONFLICT**, quote the
existing overlapping rule so the user can resolve it *before* anything is written.

Example:

```
marker: .claude/never-stale.json        CREATE (scope: team)
CLAUDE.md                               MIGRATE — wrap existing v0.5.0 sections in a sentinel fence
legacy .claude/hooks/never-stale-...js  REMOVE (replaced by plugin-owned hook)
legacy settings.json hooks              REMOVE (2 never-stale hooks)
```

Then:

- If invoked with **`--dry-run`**: stop here. Write nothing.
- If every action is SKIP (already fully set up at this scope): say so and stop.
- Otherwise **resolve before writing**, via **AskUserQuestion**:
  - No conflicts → a single **Apply** / **Cancel** is enough.
  - Any conflicts → make the user resolve **each** one: **Apply anyway** / **Skip
    this piece** / **Cancel everything**.

Write nothing until the user has chosen, and apply only what they approved.

**Write order matters.** Always write/update CLAUDE.md (Step 3) and run any migration
(Step 4b) **before** writing the marker (Step 4). The marker is the switch that arms
the gate, so it must go last — never arm the gate pointing at a CLAUDE.md that does
not yet have the rules.

## Step 3 — `<ROOT>/CLAUDE.md`  (CREATE / MERGE / UPDATE)

Write the three managed sections **wrapped once** in HTML-comment sentinels.
Substitute `<SPOKEN>` and `<WRITTEN>`. Compute `<HASH>` as the first 16 hex chars of
the SHA-256 of the **normalized body** (the text strictly between the two sentinels:
LF line endings, trailing whitespace stripped per line, leading/trailing blank lines
removed). If you cannot compute a hash, write `hash=unset` — teardown still works
(it keys off the fence, not the hash; the hash only powers an informational
"you edited this" notice).

A one-liner to compute the hash from a file holding the body:

```
node -e "const fs=require('fs'),c=require('crypto');const b=fs.readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n').map(l=>l.replace(/\s+$/,'')).join('\n').replace(/^\n+|\n+$/g,'');process.stdout.write(c.createHash('sha256').update(b).digest('hex').slice(0,16))" <bodyfile>
```

Template (the body is everything between the sentinels):

```markdown
<!-- never-stale:begin v=0.6.0 hash=<HASH> -->
## Language
- **Spoken replies** to the user: always **<SPOKEN>**. Keep this unless the user explicitly asks to switch.
- **Written files** — `CLAUDE.md`, docs, specs, `README`s, code comments, commit messages: **<WRITTEN> by default.**
- **Override:** if the user explicitly asks for a specific language for a given document, write that document in that language. An explicit request always wins over the default above.

## Doc maintenance
- After ANY code change, immediately sync the related docs (e.g. `README.md`, `CLAUDE.md`, design/spec docs). Don't wait to be asked.
- Before changing a feature, read the related docs first to confirm the current state.
- At the end of a round of changes, state clearly which docs were updated and which were not.

## Auto-compact note
- If this conversation just went through auto-compact: re-confirm the two rules above (spoken language + keep docs in sync) still apply.
- When unsure of the state, re-read this `CLAUDE.md` and the related docs; don't rely on chat memory.
<!-- never-stale:end -->
```

- **CREATE**: write a `# Project rules` title, a blank line, then the fenced block.
- **MERGE**: append the fenced block after the existing content (preserve it).
- **UPDATE**: edit only the text inside the existing fence to match the user's
  answers, then recompute and rewrite `<HASH>` in the begin sentinel.

## Step 4 — `<ROOT>/.claude/<marker>`  (CREATE / UPDATE — write LAST)

Write the marker for the chosen `<SCOPE>`:

- `team`  → `<ROOT>/.claude/never-stale.json`
- `local` → `<ROOT>/.claude/never-stale.local.json`, **and** make sure that exact
  path is gitignored: if `<ROOT>/.gitignore` exists and does not already ignore it,
  append a line `\.claude/never-stale.local.json`; if there is no `.gitignore`,
  create one with that line. (Never gitignore the committed `never-stale.json`.)

Marker contents (substitute the user's answers; the languages are recorded for
reference — the live rule lives in CLAUDE.md):

```json
{
  "$schema": "never-stale/marker@1",
  "enabled": true,
  "version": "0.6.0",
  "spoken": "<SPOKEN>",
  "written": "<WRITTEN>",
  "events": { "compact": true, "edit": true },
  "createdAt": "<ISO-8601 now, or omit if unknown>"
}
```

A project can later turn off just one reminder by setting `events.compact` or
`events.edit` to `false`. A corrupt or empty marker is treated as **disabled** by the
gate, so a half-written file never silently activates a project.

## Step 4b — Migration (only when Step 1 found legacy v0.5.0 residue)

Run this when MIGRATE was planned, before writing the marker:

- **Remove** `<ROOT>/.claude/hooks/never-stale-reminder.js` if present.
- In `<ROOT>/.claude/settings.json` **only**, remove every hook object whose
  `command` contains `never-stale-reminder.js`, then prune emptied `matcher`
  blocks / `SessionStart` / `PostToolUse` arrays / the `hooks` key, preserving all
  other settings (if the file would become `{}`, leave `{}`; never delete the file).
  If a legacy hook lives in `settings.local.json`, do NOT edit it — report it for
  manual removal.
- **Wrap** the existing three managed CLAUDE.md sections in a sentinel fence **in
  place**, preserving their current text (edited or not), and record the hash of
  that current body. If the three sections are not contiguous (interleaved with the
  user's own prose), wrap each section individually, or — if that is ambiguous —
  flag it for manual review rather than guessing a span. This is the one place that
  touches existing prose; keep it conservative.

Because hooks only reload at session restart, removing the legacy project hook and
arming the new plugin gate in the same run produces **no double-fire**: within this
session the old hook is still loaded and the new gate is not yet active for the
restart; after restart only the plugin-owned gate runs. Until a project is migrated,
its self-contained v0.5.0 setup keeps working and the plugin gate stays silent there
(no marker), so upgrading the plugin alone changes nothing observable.

## Step 5 — Verify

The gate ships in the plugin, so there is nothing project-side to execute except to
confirm the gate would now act for this project. Feed it a synthetic payload via
stdin — `CLAUDE_PROJECT_DIR` (falling back to the stdin `cwd`) is the *start* dir,
from which the gate walks up to the nearest marker:

```
echo {"cwd":"<ROOT>"} | node "${CLAUDE_PLUGIN_ROOT}/hooks/never-stale-gate.js" compact
echo {"cwd":"<ROOT>","tool_input":{"file_path":"<ROOT>/x"}} | node "${CLAUDE_PLUGIN_ROOT}/hooks/never-stale-gate.js" edit
echo {"cwd":"<ROOT>/some/subdir"} | node "${CLAUDE_PLUGIN_ROOT}/hooks/never-stale-gate.js" compact
```

Confirm the first two print the JSON `additionalContext` payload with the right
`hookEventName` (`compact` → `SessionStart`, `edit` → `PostToolUse`); the third
(a subdirectory start) should **also** fire, proving the upward walk finds the
marker. With **no** marker anywhere up to the repo root it prints **nothing**. Also
confirm the marker and CLAUDE.md both parse. For a deeper trace, set
`NEVER_STALE_DEBUG=1` and read `<os tmpdir>/never-stale-debug.log`.

> If `${CLAUDE_PLUGIN_ROOT}` is not set in your shell, substitute the plugin's
> install path (find never-stale under your Claude plugins directory).

## Step 6 — Report

Tell the user (in the chosen spoken language):

- the plan that was applied — marker scope (team/local), CLAUDE.md create/merge/
  update/migrate, any legacy residue removed, any conflict resolved;
- that the plugin's hooks are already loaded machine-wide, so usually **no restart
  is needed** — the new marker arms the gate immediately for new sessions; advise a
  restart only if the plugin itself was installed in this same session, or if a
  migration removed a still-loaded legacy hook;
- that this command touched only this project.

---

# Teardown mode (`--off`)

Reached when `$ARGUMENTS` contains **`--off`**. Inverse of setup: remove
never-stale's footprint from this project and nothing else. Skip Steps 0–6; run
T1–T4.

**Safety contract.** Remove ONLY never-stale's own artifacts. The marker is 100%
never-stale-owned (no user prose) so it is always safe to delete. For CLAUDE.md,
remove by **sentinel fence**, never by guessing boundaries. Never touch foreign
hooks, the user's own CLAUDE.md prose outside the fence, other settings, or
`settings.local.json` (read it for awareness, never modify it). Show a plan and get
confirmation before removing anything.

## T1 — Detect never-stale's artifacts

- **Marker(s)** — `<ROOT>/.claude/never-stale.json` and/or
  `<ROOT>/.claude/never-stale.local.json` present → **REMOVE** (delete file). Path-
  based, always reliable, no content matching. If a `local` marker was gitignored,
  also offer to remove its `.gitignore` line.
- **CLAUDE.md fence** — locate the `<!-- never-stale:begin … -->` /
  `<!-- never-stale:end -->` pair:
  - well-formed pair → **REMOVE the whole span** (including the sentinels and one
    trailing blank line), regardless of how the body was edited. If the body hash no
    longer matches the hash in the begin sentinel, note "you edited this since
    scaffold — removing discards your edits" and offer a **Keep** option, but never
    let an edit *block* removal.
  - **begin without a matching end** (or end without begin) → remove **nothing**;
    flag "malformed never-stale block — manual review" with the line number. Never
    guess a boundary.
  - **multiple** well-formed pairs (a botched double-run) → remove each; flag any
    unmatched sentinel.
  - **nested / overlapping** sentinels → refuse and flag.
- **Legacy v0.5.0 residue** — `<ROOT>/.claude/hooks/never-stale-reminder.js` and any
  `settings.json` hook whose `command` contains `never-stale-reminder.js` → plan to
  REMOVE (migration teardown). `settings.local.json` is never edited; flag a legacy
  hook there for manual removal.

## T2 — Removal plan (dry-run) and confirm

Show a plan, one line per artifact, e.g.:

```
.claude/never-stale.json                REMOVE (marker)
CLAUDE.md · sentinel block              REMOVE (whole fenced span)
legacy .claude/hooks/never-stale-...js  REMOVE
legacy settings.json hooks              REMOVE (2)
CLAUDE.md · sentinel block              KEEP? — body edited since scaffold (your call)
```

- If `$ARGUMENTS` also has `--dry-run`: stop here, remove nothing.
- If nothing is detected: say the project has no never-stale setup, stop.
- Otherwise confirm via **AskUserQuestion**: **Remove** / **Cancel**. For an edited
  fenced block flagged KEEP?, let the user choose to remove it anyway.

## T3 — Apply the removal

- Delete the approved marker file(s); if removing a `local` marker, optionally remove
  its `.gitignore` line.
- `CLAUDE.md`: delete the approved fenced span(s) (sentinels included), preserving all
  other content and spacing. If removing them leaves nothing but the `# Project
  rules` title (never-stale wrote the whole file), offer to delete the file;
  otherwise keep it.
- Legacy: delete the script file; in `settings.json` only, remove the never-stale
  hook objects and prune emptied containers down to (not below) `{}`.
- Never modify `settings.local.json`.

## T4 — Report

Tell the user (in their spoken language): what was removed vs kept (and why a KEEP
was kept); that, since the hooks now ship in the plugin and are gated by the marker,
**deleting the marker disarms the gate for new sessions immediately** (a restart only
clears the reminder from the *current* session, or finishes removing a legacy
project hook); that the plugin itself is still installed machine-wide (use
`/plugin uninstall never-stale@biznuts` to remove it everywhere at once — a clean,
symmetric removal that leaves no executable code in any project); and that only this
project was touched.

---

# List mode (`--list`)

Reached when `$ARGUMENTS` contains **`--list`**. Enumerate every project on disk that
is opted into never-stale (or carries legacy residue), so the user can find them all
before uninstalling the plugin or to audit what is enabled.

- Determine a search root: the path in `$ARGUMENTS` if given, else `<ROOT>` (cwd).
- Use Glob to find, under that root:
  - `**/.claude/never-stale.json` and `**/.claude/never-stale.local.json` (current
    opt-in markers);
  - `**/.claude/hooks/never-stale-reminder.js` (legacy v0.5.0 installs to migrate or
    `--off`).
- For each match, read the marker (if any) and report: the project root, the scope
  (team/local), `enabled` state, recorded languages, and whether it is current
  (marker) or legacy (reminder script). Group current vs legacy.
- Write nothing. End by reminding the user they can run `/never-stale --off` in any
  listed project to clean it, and that `/plugin uninstall never-stale@biznuts`
  removes the hooks machine-wide (leaving only the inert markers + CLAUDE.md prose,
  which `--off` clears).
