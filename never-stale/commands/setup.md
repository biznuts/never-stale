---
description: Opt THIS project into never-stale — scaffold the CLAUDE.md language + doc-sync rules and write the per-project opt-in marker that arms the plugin's hooks here. Idempotent; per-project; manual trigger only; touches no other project.
argument-hint: "[optional project root path; defaults to cwd] [--dry-run]"
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# never-stale — set up this project

Goal: stop the assistant from "forgetting" project conventions mid-session — keep
docs in sync, keep language consistent, and re-confirm the rules after every
auto-compact.

This is the **setup** verb. Related verbs (each its own command):
`/never-stale:off` (pause) · `/never-stale:on` (resume) · `/never-stale:remove`
(full teardown) · `/never-stale:list` · `/never-stale:status` · `/never-stale:update`
(reconcile versions / language codes after a plugin upgrade).

## How it works (read this before doing anything)

The hooks **ship inside the plugin** (`hooks/hooks.json` +
`hooks/never-stale-gate.js`, resolved via `${CLAUDE_PLUGIN_ROOT}`). Once the plugin
is installed they are registered **machine-wide**, so the gate script **runs in
every session** — but it only **acts** in a project that carries an opt-in
**marker** file. Running is not acting:

- **plugin enabled** → the gate script *runs* in every session;
- **marker present** (`<ROOT>/.claude/never-stale.json` or `never-stale.local.json`
  with `enabled: true`) → the gate *acts* (emits a reminder) in that project only;
- no marker, or `enabled: false` → the gate exits silently. Other projects are
  untouched.

To find the marker the gate walks **up** from the launch dir (`CLAUDE_PROJECT_DIR`,
falling back to the stdin `cwd`) to the nearest ancestor that carries one — so
launching from a subdirectory still works — bounded by the git repo root so a marker
outside the repo never governs it. A marker therefore covers its directory and
everything below it; a subtree can opt out with its own `"enabled": false` marker.

Therefore setup does **not** write any hook into the project and does **not** drop a
script into the project. It only writes two project-owned things: the **marker** (the
opt-in switch) and the **CLAUDE.md** rules block. This is what makes uninstall clean:
`/plugin uninstall` removes the plugin's hooks machine-wide, and the only per-project
leftover is inert data (the marker + your own CLAUDE.md prose), never orphaned
executable code.

Be **idempotent**: if something already exists, merge/update it, never duplicate.

**Project root** = the path in `$ARGUMENTS` (ignoring any flag) if a path was given,
otherwise the current working directory. Call it `<ROOT>`. Wherever a template shows
`<ROOT>`, substitute the **real absolute path** — never write the literal `<ROOT>`.

**Dry-run.** If `$ARGUMENTS` contains `--dry-run`, only inspect and print the plan,
then STOP without writing anything.

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
> reminders can run `/never-stale:off` locally (which drops a local marker with
> `enabled: false`) to veto an inherited team opt-in, without changing the repo.

## Step 1 — Inspect the project and build a plan

Before writing anything, detect the current state of each artifact and decide its
action. Use Glob / Read.

- **Marker** — read `<ROOT>/.claude/never-stale.json` and
  `<ROOT>/.claude/never-stale.local.json` as JSON if present.
  - a marker for the chosen `<SCOPE>` already exists with `enabled: true` → **SKIP**
    (already opted in at that scope; you may still UPDATE its recorded
    `spoken`/`written` if the user picked different languages).
  - a marker for the chosen `<SCOPE>` exists but `enabled: false` (it was paused via
    `/never-stale:off`) → **RE-ENABLE**: set `enabled: true` and reconcile languages
    (this is also what `/never-stale:on` does).
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
MERGE / UPDATE / MIGRATE / RE-ENABLE / SKIP / CONFLICT). For every **CONFLICT**, quote
the existing overlapping rule so the user can resolve it *before* anything is written.

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
node -e "const fs=require('fs'),c=require('crypto');const tr=s=>{let e=s.length;while(e>0&&(s.charCodeAt(e-1)===32||s.charCodeAt(e-1)===9))e--;return s.slice(0,e)};const n=t=>{const L=t.replace(/\r\n/g,'\n').split('\n').map(tr).join('\n');let a=0,b=L.length;while(a<b&&L.charCodeAt(a)===10)a++;while(b>a&&L.charCodeAt(b-1)===10)b--;return L.slice(a,b)};process.stdout.write(c.createHash('sha256').update(n(fs.readFileSync(process.argv[1],'utf8'))).digest('hex').slice(0,16))" <bodyfile>
```

Template (the body is everything between the sentinels):

```markdown
<!-- never-stale:begin v=0.10.1 hash=<HASH> -->
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
  "version": "0.10.1",
  "spoken": "<SPOKEN>",
  "spokenCode": "<SPOKEN_CODE>",
  "written": "<WRITTEN>",
  "writtenCode": "<WRITTEN_CODE>",
  "events": { "compact": true, "edit": true },
  "createdAt": "<ISO-8601 now, or omit if unknown>"
}
```

`<SPOKEN_CODE>` / `<WRITTEN_CODE>` are the canonical code for the chosen language, so
the recorded language stays comparable across markers even if the display string is
worded differently later:

| Chosen language | Code |
|---|---|
| English | `en` |
| Traditional Chinese | `zh-Hant` |
| Traditional Chinese (Hong Kong) | `zh-HK` |
| Simplified Chinese | `zh-Hans` |

If the user picked an **Other** language (anything outside the four), keep their text
in `spoken` / `written` and **omit** the corresponding `…Code` key (do not invent a
code).

A project can later turn off just one reminder by setting `events.compact` or
`events.edit` to `false`, or pause the whole project with `/never-stale:off`
(`enabled: false`). A corrupt or empty marker is treated as **disabled** by the gate,
so a half-written file never silently activates a project.

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
- how to manage it from here: pause with `/never-stale:off` and resume with
  `/never-stale:on` (both keep your languages), inspect with `/never-stale:status`,
  reconcile versions/language codes after a plugin upgrade with `/never-stale:update`,
  or fully remove with `/never-stale:remove`;
- that this command touched only this project.
