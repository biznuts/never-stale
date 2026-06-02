---
description: Make THIS project never-stale — scaffold language rules + doc-sync discipline + reminder hooks that survive auto-compact. Cross-platform (Node). Per-project, manual trigger only; touches no other project.
argument-hint: "[optional project root path; defaults to cwd] [--off] [--dry-run]"
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# never-stale — set up this project

Goal: stop the assistant from "forgetting" project conventions mid-session — keep
docs in sync, keep language consistent, and re-confirm the rules after every
auto-compact.

Do this for the current project. Be **idempotent**: if a file already exists,
merge/update it, never duplicate. Cross-platform: the hooks run via **Node**
(Claude Code already requires Node), so this works on Windows, macOS, and Linux.

**Project root** = the path in `$ARGUMENTS` (ignoring any `--dry-run` flag) if a
path was given, otherwise the current working directory. Call it `<ROOT>`. Wherever
a template shows `<ROOT>`, substitute the **real absolute path** of the project root
(you know the cwd) — never write the literal string `<ROOT>`.

**Mode.** Default = **set up** this project (Steps 0–7 below). If `$ARGUMENTS`
contains **`--off`**, instead run **Teardown mode** (the section at the very end of
this file) to remove never-stale's own setup from this project. The two are a
toggle: `/never-stale` opts a project in, `/never-stale --off` opts it out.

**Dry-run.** If `$ARGUMENTS` contains `--dry-run`, only inspect and print the plan,
then STOP without writing or removing anything. Works with both modes — setup: do
Steps 0–2 only; teardown: show the removal plan only.

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
`<SPOKEN>` and `<WRITTEN>`. Use them in Step 3.

## Step 1 — Inspect the project and build a plan

Before writing anything, detect the current state of each artifact and decide its
action. Use Glob / Read, and parse **both** `<ROOT>/.claude/settings.json` and
`<ROOT>/.claude/settings.local.json` as JSON if present.

- **`<ROOT>/CLAUDE.md`**
  - missing → **CREATE**.
  - exists with a top-level `## Language` section → **UPDATE** (reconcile it to
    `<SPOKEN>` / `<WRITTEN>`; never add a second Language section).
  - exists and already states a language, doc-maintenance, or post-compact rule
    under a *different* heading or structure (e.g. a `### 語言` / `## 語言` heading,
    a `## Standing Rules`, a "source of truth" doc discipline, a compact
    self-check) → **CONFLICT (review)**: the project already has its own
    convention. Do NOT blindly append the generic sections — that would duplicate
    and may contradict it (e.g. the project writes docs in one language while this
    template would default to another). Surface the existing rule in Step 2 and let
    the user resolve.
  - exists with none of the above → **MERGE** (append the three sections).
- **`<ROOT>/.claude/hooks/never-stale-reminder.js`**
  - missing → **CREATE**.
  - exists → **SKIP** (the script is static and identical; never duplicate).
- **Existing hooks** — for **each** of never-stale's two hooks (`SessionStart` /
  `compact` and `PostToolUse` / `Edit|Write|MultiEdit`), look across **both**
  `settings.json` **and** `settings.local.json` (either may register hooks — the
  local file frequently does). Duplicate detection keys off the command string:
  - never-stale's own hook already present (a `command` containing
    **`never-stale-reminder.js`**) in **either** file → **SKIP** (already
    installed; never add a second copy).
  - a **foreign** hook at the same event+matcher (a `command` WITHOUT
    `never-stale-reminder.js`) in **either** file → **CONFLICT**: both would fire
    (double reminder). Record **which file** it lives in. Flag for resolution in
    Step 2; never add silently.
  - neither → **ADD** never-stale's hook.
- **`<ROOT>/.claude/settings.json` file** — missing → **CREATE** with the planned
  hooks; exists → **MERGE** the planned ADDs into it. never-stale only ever WRITES
  to `settings.json`; it reads `settings.local.json` for detection but never
  modifies it.

## Step 2 — Dry-run preview, surface conflicts, and resolve before writing

Show the user the plan as a short list, one line per artifact and per hook, marking
each action (CREATE / MERGE / UPDATE / SKIP / ADD / CONFLICT). For every
**CONFLICT**, show the specifics so the user can resolve it *before* anything is
written:
- hook conflict — name the event, the existing `command`, and **which file** it is
  in (`settings.json` or `settings.local.json`);
- CLAUDE.md conflict — quote the existing rule that overlaps.

Example:

```
CLAUDE.md                         CONFLICT — already has a "### 語言" rule (replies zh-HK; docs in Chinese)
.claude/hooks/never-stale-...js   CREATE
settings.json · PostToolUse       ADD
SessionStart · compact            CONFLICT — settings.local.json already runs after-compact.ps1 on compact
```

Then:
- If invoked with **`--dry-run`**: stop here. Write nothing.
- If every action is SKIP (already fully set up): say it is already never-stale,
  nothing to do, and stop.
- Otherwise **resolve before writing**, via **AskUserQuestion**:
  - No conflicts → a single **Apply** / **Cancel** is enough.
  - Any conflicts → make the user resolve **each** one. Per conflict, offer:
    **Apply anyway** (accept the duplicate / addition), **Skip this piece** (leave
    the project's existing setup untouched for that item), or **Cancel everything**.

Write nothing until the user has chosen, and apply only what they approved in
Steps 3–5.

## Step 3 — `<ROOT>/CLAUDE.md`  (per the plan: CREATE / MERGE / UPDATE)

Substitute `<SPOKEN>` and `<WRITTEN>` with the user's answers.

```markdown
# Project rules

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
```

On MERGE: add these three sections, preserving the project's existing content. On
UPDATE: reconcile the existing `## Language` section to match the user's answers
rather than adding a duplicate.

## Step 4 — `<ROOT>/.claude/hooks/never-stale-reminder.js`  (per the plan: CREATE / SKIP)

This single Node script powers both hooks. It is fully static (no substitution),
emits UTF-8 JSON natively, and is cross-platform.

```javascript
#!/usr/bin/env node
// never-stale: emit a context reminder as a hook additionalContext payload.
// Usage: node never-stale-reminder.js <compact|edit>
const kind = process.argv[2];

const messages = {
  compact:
    "[never-stale] Auto-compact happened. Re-confirm the rules in CLAUDE.md still apply: " +
    "the language for spoken replies and for written files, and syncing related docs after every code change. " +
    "Re-read CLAUDE.md instead of relying on chat memory.",
  edit:
    "[never-stale] A file was just edited — check whether related docs " +
    "(README / CLAUDE.md / design or spec docs) need to be synced.",
};

const eventName = kind === "compact" ? "SessionStart" : "PostToolUse";
const additionalContext = messages[kind] || messages.edit;

process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext } })
);
```

The reminders intentionally point back to `CLAUDE.md` (the single source of truth)
instead of hardcoding the language, so changing the language later only means
editing `CLAUDE.md`.

## Step 5 — `<ROOT>/.claude/settings.json`  (per the plan: CREATE / ADD / SKIP)

Substitute `<ROOT>` with the real absolute project path and escape backslashes for
JSON (on Windows: `C:\\Users\\...`). The `PostToolUse` hook output MUST be JSON
`additionalContext` (plain stdout does not reach context for `PostToolUse`) — the
Node script handles that.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<ROOT>/.claude/hooks/never-stale-reminder.js\" compact",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<ROOT>/.claude/hooks/never-stale-reminder.js\" edit",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

On CREATE: write the file above. On ADD: parse the existing `settings.json`, append
the planned hook object(s) into the matching `hooks.SessionStart` /
`hooks.PostToolUse` arrays (create the arrays / `hooks` key if missing), write it
back as valid JSON, and do not clobber other settings. On SKIP: leave that hook
untouched (never-stale is already there). Honor the Step 2 decision for any
CONFLICT.

## Step 6 — Verify

Run the Node script both ways and confirm each prints valid JSON with the right
`hookEventName`:

```
node "<ROOT>/.claude/hooks/never-stale-reminder.js" compact
node "<ROOT>/.claude/hooks/never-stale-reminder.js" edit
```

Confirm `compact` → `SessionStart`, `edit` → `PostToolUse`, and that
`settings.json` parses as valid JSON.

## Step 7 — Report

Tell the user (in the chosen spoken language):
- the plan that was applied — which files were created vs merged vs updated vs
  skipped (and any conflict the user resolved),
- that hooks load only at session start, so they must **restart Claude Code** (or
  open a new session) in this project for the hooks to activate; `/hooks` shows
  them registered,
- that this command touched only this project.

---

# Teardown mode (`--off`)

Reached only when `$ARGUMENTS` contains **`--off`**. This is the inverse of setup:
remove never-stale's own footprint from this project and nothing else. It is the
opt-out half of the toggle. Skip Steps 0–7 above entirely; run T1–T4 instead.

**Safety contract.** Remove ONLY artifacts never-stale created. Never touch foreign
hooks, user-authored `CLAUDE.md` prose, other settings, or `settings.local.json`
(read it for awareness, never modify it). When in doubt, keep and report rather
than delete. Like setup, show a plan and get confirmation before removing anything.

## T1 — Detect never-stale's artifacts

- **Hook script** `<ROOT>/.claude/hooks/never-stale-reminder.js` — present → **REMOVE
  (delete file)**; absent → nothing.
- **`<ROOT>/.claude/settings.json` hooks** — find every hook object whose `command`
  contains **`never-stale-reminder.js`** (these are never-stale's). Plan to remove
  exactly those. (Never-stale only ever wrote to `settings.json`, so only look
  there for removal. If a never-stale hook somehow appears in `settings.local.json`,
  do NOT edit that file — report it for manual removal.)
- **`<ROOT>/CLAUDE.md` sections** — the three never-stale headings: `## Language`,
  `## Doc maintenance`, `## Auto-compact note`. For each present heading, compare
  its body to never-stale's template (Step 3 above):
  - body matches the template (unmodified) → **REMOVE (safe)**;
  - body was edited by the user, or the heading also holds non-template content →
    **KEEP + flag** (it is now user content; do not destroy it).

## T2 — Removal plan (dry-run) and confirm

Show a plan, one line per artifact, e.g.:

```
.claude/hooks/never-stale-reminder.js   REMOVE
settings.json · SessionStart/compact    REMOVE (never-stale hook)
settings.json · PostToolUse             REMOVE (never-stale hook)
CLAUDE.md · ## Language                 KEEP — edited since scaffold (yours now)
CLAUDE.md · ## Doc maintenance          REMOVE (matches template)
CLAUDE.md · ## Auto-compact note        REMOVE (matches template)
```

- If `$ARGUMENTS` also has `--dry-run`: stop here, remove nothing.
- If nothing is detected: say the project has no never-stale setup, nothing to do,
  stop.
- Otherwise confirm via **AskUserQuestion**: **Remove** / **Cancel**. For any item
  flagged KEEP, let the user choose to remove it anyway (it is their content now).
  Remove nothing until the user confirms.

## T3 — Apply the removal

- Delete the hook script file if planned.
- `settings.json`: parse it, remove only the never-stale hook objects. Then prune
  empties — an emptied `matcher` block, an emptied `SessionStart` / `PostToolUse`
  array, and an emptied `hooks` key — but preserve the file and every other
  setting. If the file would become `{}`, leave `{}` (do not delete the file).
- `CLAUDE.md`: delete only the approved sections, preserving all other content and
  spacing. If removing them leaves nothing but the `# Project rules` title (i.e.
  never-stale wrote the whole file), offer to delete the file; otherwise keep it.
- Never modify `settings.local.json`.

## T4 — Report

Tell the user (in their spoken language): what was removed vs kept (and why a KEEP
was kept), that the hooks stop firing only after a **restart** (they are still
loaded in the current session), that the plugin itself is still installed
machine-wide (use `/plugin uninstall never-stale@biznuts` to remove that), and that
only this project was touched.
