#!/usr/bin/env node
// never-stale gate + emitter.
//
// This is the ONLY copy of the script on the machine. It is shipped inside the
// plugin and registered machine-wide by hooks/hooks.json, so it RUNS in every
// session — but it only ACTS in a project the user explicitly opted into, detected
// by a marker file. Running is not acting.
//
//   plugin enabled  -> this script RUNS in every session
//   marker present  -> this script ACTS (emits a reminder) in that project only
//
// Project-root resolution. CLAUDE_PROJECT_DIR (and the stdin `cwd`) is the directory
// Claude Code was LAUNCHED from, which is often a subdirectory of the project — so a
// flat check there misses an opted-in project when you launch from a subdir
// (verified empirically). Instead we walk UP from the launch dir to the nearest
// ancestor that carries a marker (nearest-ancestor-wins, like .editorconfig /
// .gitignore), bounded by the git repo root so a stray marker OUTSIDE the repo can
// never govern it. The walk only ever finds ANCESTORS of the launch dir, so it never
// fires for a true sibling subtree.
//
// Usage: node never-stale-gate.js <compact|edit>   (hook payload arrives on stdin)
//
// Troubleshooting: set NEVER_STALE_DEBUG=1 to append one JSON diagnostic line per
// invocation to <os tmpdir>/never-stale-debug.log (resolved root, marker presence,
// decision). Off by default; never affects behavior.
//
// Contract: NEVER throw, NEVER exit non-zero, NEVER write to stderr. On any doubt,
// exit 0 with empty stdout (a silent no-op). Failing safe means "no reminder" —
// never "fire in a project the user did not opt into".

const fs = require("fs");
const path = require("path");

const messages = {
  compact:
    "[never-stale] Auto-compact happened. Re-confirm the rules in CLAUDE.md still apply: " +
    "the language for spoken replies and for written files, and syncing related docs after every code change. " +
    "Re-read CLAUDE.md instead of relying on chat memory.",
  edit:
    "[never-stale] A file was just edited — check whether related docs " +
    "(README / CLAUDE.md / design or spec docs) need to be synced.",
};

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

// True if `target` is inside (or equal to) `root`, using a path-separator boundary
// so that "/a/foobar" is NOT considered inside "/a/foo".
function isInside(root, target) {
  try {
    const r = path.resolve(root);
    const t = path.resolve(target);
    return t === r || t.startsWith(r + path.sep);
  } catch {
    return false;
  }
}

// Walk up from `start` to the nearest ancestor carrying a marker. Returns
// { dir, marker } for the governing project, or null if none up to the git repo
// root / filesystem root. A directory that has a marker file STOPS the walk even if
// the marker is corrupt (nearest-marker-wins; corrupt is handled as "disabled" by
// the caller) — we never skip past it to a more distant ancestor.
function findGoverning(start) {
  let dir;
  try {
    dir = path.resolve(start);
  } catch {
    return null;
  }
  for (let i = 0; i < 64; i++) {
    const localP = path.join(dir, ".claude", "never-stale.local.json");
    const sharedP = path.join(dir, ".claude", "never-stale.json");
    const hasLocal = exists(localP);
    const hasShared = exists(sharedP);
    if (hasLocal || hasShared) {
      return { dir, marker: hasLocal ? readJsonSafe(localP) : readJsonSafe(sharedP) };
    }
    // Don't let a marker OUTSIDE the repo govern it: stop at the repo root.
    if (exists(path.join(dir, ".git"))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
  return null;
}

function dbg(obj) {
  if (!process.env.NEVER_STALE_DEBUG) return;
  try {
    const os = require("os");
    fs.appendFileSync(path.join(os.tmpdir(), "never-stale-debug.log"), JSON.stringify(obj) + "\n");
  } catch {
    /* diagnostics must never affect behavior */
  }
}

function main() {
  const kind = process.argv[2] === "compact" ? "compact" : "edit";

  // Read the hook payload from stdin (best-effort; tolerate empty / malformed).
  let input = {};
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (raw && raw.trim()) input = JSON.parse(raw) || {};
  } catch {
    input = {};
  }

  const start = process.env.CLAUDE_PROJECT_DIR || input.cwd || "";
  const diag = { kind, CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || "", stdin_cwd: input.cwd || "", start };

  let emit = null;
  let reason = "";

  if (!start) {
    reason = "no-start-dir";
  } else {
    const found = findGoverning(start);
    diag.root = found ? found.dir : "";
    if (!found) {
      reason = "no-marker-in-tree";
    } else if (!found.marker || found.marker.enabled !== true) {
      reason = "marker-not-enabled";
    } else {
      const root = found.dir;
      const events = found.marker.events || {};
      if (kind === "edit") {
        if (events.edit === false) {
          reason = "edit-disabled";
        } else {
          const ti = input.tool_input || {};
          const edited = ti.file_path || ti.path || ti.notebook_path || "";
          diag.edited = edited;
          if (edited && !isInside(root, edited)) reason = "edit-outside-project";
          else emit = "PostToolUse";
        }
      } else if (events.compact === false) {
        reason = "compact-disabled";
      } else {
        emit = "SessionStart";
      }
    }
  }

  diag.decision = emit ? "fire" : "silent";
  diag.reason = reason || (emit ? "ok" : "");
  dbg(diag);

  if (emit) {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: emit, additionalContext: messages[kind] } })
    );
  }
}

try {
  main();
} catch {
  // Absolute backstop: a hook must never crash the session.
}
