---
description: Make THIS project never-stale — scaffold language rules + doc-sync discipline + reminder hooks that survive auto-compact. Cross-platform (Node). Per-project, manual trigger only; touches no other project.
argument-hint: "[optional project root path; defaults to the current working directory]"
allowed-tools: Read, Write, Edit, Bash, Glob, AskUserQuestion
---

# never-stale — set up this project

Goal: stop the assistant from "forgetting" project conventions mid-session — keep
docs in sync, keep language consistent, and re-confirm the rules after every
auto-compact.

Do this NOW for the current project. Be **idempotent**: if a file already exists,
merge/update it, never duplicate. Cross-platform: the hooks run via **Node**
(Claude Code already requires Node), so this works on Windows, macOS, and Linux.

**Project root** = `$ARGUMENTS` if a path was given, otherwise the current
working directory. Call it `<ROOT>`. Wherever a template shows `<ROOT>`, substitute
the **real absolute path** of the project root (you know the cwd) — never write the
literal string `<ROOT>`.

## Step 0 — Ask the user for language preferences

Use the **AskUserQuestion** tool to ask two things (offer English as the default
first option, plus a couple of common choices, and let them pick "Other" to type
any language):

1. **Spoken replies** — what language should the assistant talk to the user in?
   (default: **English**)
2. **Written files** — what language should newly written docs/specs/READMEs/code
   comments default to? (default: **English**)

Call the chosen values `<SPOKEN>` and `<WRITTEN>`. Use them in Step 1.

## Step 1 — `<ROOT>/CLAUDE.md`  (create, or merge these rules if it exists)

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

If `CLAUDE.md` already exists: merge these three sections in, preserving the
project's existing content. If it already has a `## Language` section, reconcile
(update it to match the user's answers) rather than adding a duplicate.

## Step 2 — `<ROOT>/.claude/hooks/never-stale-reminder.js`  (create)

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

## Step 3 — `<ROOT>/.claude/settings.json`  (create, or MERGE the two hooks if it exists)

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

If `settings.json` already exists: parse it, append these hook objects into the
existing `hooks.SessionStart` / `hooks.PostToolUse` arrays (create the arrays /
`hooks` key if missing), and write it back as valid JSON. Do not clobber other
settings. If the project already has a `SessionStart` `compact` hook or a
`PostToolUse` `Edit|Write` hook, warn the user that both will fire (double
reminder) and ask before adding a duplicate.

## Step 4 — Verify

Run the Node script both ways and confirm each prints valid JSON with the right
`hookEventName`:

```
node "<ROOT>/.claude/hooks/never-stale-reminder.js" compact
node "<ROOT>/.claude/hooks/never-stale-reminder.js" edit
```

Confirm `compact` → `SessionStart`, `edit` → `PostToolUse`, and that
`settings.json` parses as valid JSON.

## Step 5 — Report

Tell the user (in the chosen spoken language):
- which files were created vs merged,
- that hooks load only at session start, so they must **restart Claude Code** (or
  open a new session) in this project for the hooks to activate; `/hooks` shows
  them registered,
- that this command touched only this project.
