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
// Optional drift detection (v0.9.0+). A marker MAY declare `syncPairs` to pair a
// "source" doc (a ledger / changelog) with a "snapshot" doc that is supposed to stay
// reconciled to it. When present, the gate flags a snapshot that has fallen behind:
//   - on compact: appends an advisory drift line to the reminder (read-time signal);
//   - on edit:    if you edited a configured SOURCE, the reminder is retargeted to
//                 "go update the paired snapshot" instead of the generic nudge.
// Two modes are implemented:
//   - "mtime" (default): a pure fs.stat comparison — source edited more recently than
//     the snapshot. No file READ, no regex.
//   - "hash": content drift. The snapshot embeds a synced-to marker
//     (`<!-- never-stale:synced-to <hex> -->`) declaring which source content it was
//     last reconciled to; the gate hashes the source's normalized content (a bounded,
//     compact-only read) and flags a mismatch. The synced-to marker is matched with a
//     STATIC gate-owned pattern — no user-supplied regex, so no ReDoS surface, and no
//     per-edit content I/O (reads happen only on the low-frequency compact path).
// The "declared" and "version" modes remain reserved and a silent no-op here. With no
// `syncPairs`, the emitted reminder is byte-identical to the pre-0.9.0 behaviour.
//
// Usage: node never-stale-gate.js <compact|edit>   (hook payload arrives on stdin)
//
// Troubleshooting: set NEVER_STALE_DEBUG=1 to append one JSON diagnostic line per
// invocation to <os tmpdir>/never-stale-debug.log (resolved root, marker presence,
// decision). Off by default; never affects behavior.
//
// Contract: NEVER throw, NEVER exit non-zero, NEVER write to stderr. On any doubt,
// exit 0 with empty stdout (a silent no-op). Failing safe means "no reminder" —
// never "fire in a project the user did not opt into". The drift checks also honor a
// BOUNDED-WORK rule: a bounded pair count (MAX_PAIRS), no user-supplied regex, and any
// file read is size-capped (MAX_HASH_BYTES) and happens only on the low-frequency
// compact path — so the gate can never hang, only ever fall back to the plain reminder.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const messages = {
  compact:
    "[never-stale] Auto-compact happened. Re-confirm the rules in CLAUDE.md still apply: " +
    "the language for spoken replies and for written files, and syncing related docs after every code change. " +
    "Re-read CLAUDE.md instead of relying on chat memory.",
  edit:
    "[never-stale] A file was just edited — check whether related docs " +
    "(README / CLAUDE.md / design or spec docs) need to be synced.",
};

// Upper bound on how many sync pairs we will ever inspect in one invocation
// (bounded-work contract — a runaway pair list can never make the gate slow).
const MAX_PAIRS = 50;

// Upper bound on the size of a doc the gate will read+hash in `hash` mode. A doc
// larger than this is skipped (treated as "unknown", surfaced in /never-stale:status),
// so the read-time hash work stays bounded even with an adversarial marker. Reads only
// ever happen on the low-frequency compact path, never per-edit.
const MAX_HASH_BYTES = 512 * 1024;

// The synced-to marker a snapshot embeds to declare which source content it was last
// reconciled to, e.g. `<!-- never-stale:synced-to 8c2b42f56e6fd699 -->`. STATIC and
// gate-owned (never a user-supplied pattern), so there is no ReDoS surface — the hex
// class is bounded and the pattern is linear.
const SYNCED_TO_RE = /never-stale:synced-to\s+([0-9a-fA-F]{8,64})/;

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

// A syncPairs `source`/`snapshot` is a REPO-RELATIVE path by contract. Reject anything
// that could resolve outside the project: absolute, drive-qualified (C:\…), UNC
// (\\server), or parent-escaping (..). This is checked BEFORE any fs touch.
function isUnsafeRel(rel) {
  if (typeof rel !== "string" || !rel) return true;
  if (path.isAbsolute(rel)) return true;
  if (/^[a-zA-Z]:/.test(rel)) return true; // drive-qualified
  if (rel.startsWith("\\\\") || rel.startsWith("//")) return true; // UNC
  if (rel.split(/[\\/]+/).includes("..")) return true; // parent escape
  return false;
}

// Resolve a repo-relative pair path to an absolute path INSIDE root, or null if the
// path is unsafe or escapes the project. Never throws.
function resolveInside(root, rel) {
  try {
    if (isUnsafeRel(rel)) return null;
    const abs = path.resolve(root, rel);
    return isInside(root, abs) ? abs : null;
  } catch {
    return null;
  }
}

function mtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null; // a missing/unreadable doc is "unknown", not "drift"
  }
}

// Normalize text so cosmetic churn (CRLF vs LF, trailing space/tab, leading/trailing
// blank lines) does not register as content drift. Implemented with LINEAR char scans,
// NOT trailing-anchored regexes: `/[ \t]+$/` (and `/\n+$/`) are O(n^2) on a long run of
// the class that does not reach the anchor — and this runs over user-controlled source
// content on the compact path, so a regex here would reintroduce the exact ReDoS/hang
// the bounded-work contract forbids. The only regex is the fixed-string CRLF collapse
// (no quantifier → linear). Produces the same value as a per-line trailing-trim would
// for normal docs, so the hash stays reproducible from the documented one-liner.
function normalize(text) {
  const lf = text.replace(/\r\n/g, "\n");
  const lines = lf.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let e = l.length;
    while (e > 0) {
      const c = l.charCodeAt(e - 1);
      if (c === 32 || c === 9) e--; // trailing space or tab
      else break;
    }
    if (e !== l.length) lines[i] = l.slice(0, e);
  }
  const joined = lines.join("\n");
  let a = 0;
  let b = joined.length;
  while (a < b && joined.charCodeAt(a) === 10) a++; // leading blank lines
  while (b > a && joined.charCodeAt(b - 1) === 10) b--; // trailing blank lines
  return joined.slice(a, b);
}

// Read a doc as UTF-8, but only if it is a regular file within the size cap. Returns
// null (skip) for anything missing, oversized, or unreadable — bounded-work + fail-safe.
function readBounded(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_HASH_BYTES) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// Full SHA-256 hex of a doc's normalized content, or null if it cannot be read/hashed.
function contentHash(file) {
  const raw = readBounded(file);
  if (raw === null) return null;
  try {
    return crypto.createHash("sha256").update(normalize(raw)).digest("hex");
  } catch {
    return null;
  }
}

// The synced-to hash a snapshot declares (lowercased), or null when the snapshot
// carries no synced-to marker (unknown — surfaced in /never-stale:status, never "drift").
function declaredSyncHash(file) {
  const raw = readBounded(file);
  if (raw === null) return null;
  const m = SYNCED_TO_RE.exec(raw);
  return m ? m[1].toLowerCase() : null;
}

// Compute drift notes for the marker's syncPairs. Returns a (possibly empty) array of
// human-readable strings. Supports mode "mtime" (stat-only) and "hash" (bounded read +
// synced-to marker compare, no user regex). Fail-safe and bounded: a bad/escaping/
// oversized/unimplemented pair is skipped, never thrown.
function checkPairs(root, pairs) {
  const out = [];
  if (!Array.isArray(pairs) || !pairs.length) return out;
  for (const p of pairs.slice(0, MAX_PAIRS)) {
    try {
      if (!p || typeof p !== "object") continue;
      const mode = typeof p.mode === "string" ? p.mode : "mtime";
      const src = resolveInside(root, p.source);
      const snap = resolveInside(root, p.snapshot);
      if (!src || !snap) continue;
      if (mode === "mtime") {
        const sm = mtimeMs(src);
        const pm = mtimeMs(snap);
        if (sm === null || pm === null) continue;
        if (sm > pm) {
          out.push(
            `${p.snapshot} may be behind ${p.source} (the source was edited more recently); verify before trusting it.`,
          );
        }
      } else if (mode === "hash") {
        // Content drift: the snapshot declares which source content it last reconciled
        // to (a synced-to marker); compare it to the source's current normalized hash.
        const declared = declaredSyncHash(snap);
        if (!declared) continue; // no marker -> unknown, not drift (surfaced in /status)
        const current = contentHash(src);
        if (current === null) continue; // unreadable/oversized -> unknown
        if (!current.startsWith(declared)) {
          out.push(
            `${p.snapshot} may be behind ${p.source} (source content changed since the ` +
              `snapshot's synced-to mark ${declared}; it is now ${current.slice(0, declared.length)}) — ` +
              `reconcile and update the synced-to marker.`,
          );
        }
      }
      // other modes (declared, version) are reserved and a silent no-op for now
    } catch {
      /* per-pair isolation — one bad pair never blocks the rest */
    }
  }
  return out;
}

// On an edit, return the snapshot names of the pair(s) whose SOURCE is the edited file
// (so the reminder can retarget to "update the snapshot"). Pure path comparison — no
// fs read. Returns [] when nothing matches (the caller then uses the generic reminder).
function snapshotsForEditedSource(root, pairs, editedAbs) {
  const snaps = [];
  if (!Array.isArray(pairs) || !pairs.length || !editedAbs) return snaps;
  let target;
  try {
    target = path.resolve(editedAbs);
  } catch {
    return snaps;
  }
  for (const p of pairs.slice(0, MAX_PAIRS)) {
    try {
      if (!p || typeof p !== "object") continue;
      const src = resolveInside(root, p.source);
      if (src && path.resolve(src) === target && typeof p.snapshot === "string" && p.snapshot) {
        if (!snaps.includes(p.snapshot)) snaps.push(p.snapshot);
      }
    } catch {
      /* skip */
    }
  }
  return snaps;
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
  // The emitted reminder. Defaults to the static message for `kind`; the syncPairs
  // logic may REPLACE it (edit, retargeted) or APPEND to it (compact, drift note).
  // When no syncPairs are configured it stays byte-identical to messages[kind].
  let outMsg = messages[kind];

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
      const marker = found.marker;
      const events = marker.events || {};
      if (kind === "edit") {
        if (events.edit === false) {
          reason = "edit-disabled";
        } else {
          const ti = input.tool_input || {};
          const edited = ti.file_path || ti.path || ti.notebook_path || "";
          diag.edited = edited;
          if (edited && !isInside(root, edited)) {
            reason = "edit-outside-project";
          } else {
            emit = "PostToolUse";
            // Edit-side targeting: if the edited file is a configured SOURCE, retarget
            // the reminder to its snapshot(s). Every OTHER in-project edit keeps the
            // generic reminder verbatim (so configuring a pair never silences the
            // doc-sync nudge for unrelated files).
            try {
              const snaps = edited ? snapshotsForEditedSource(root, marker.syncPairs, edited) : [];
              if (snaps.length) {
                outMsg =
                  "[never-stale] You edited a tracked source doc — update " +
                  snaps.join(", ") +
                  " (and its synced-to marker) so the snapshot does not fall behind.";
                diag.targeted = snaps.join(",");
              }
            } catch {
              outMsg = messages.edit; // fail-safe: generic reminder
            }
          }
        }
      } else if (events.compact === false) {
        reason = "compact-disabled";
      } else {
        emit = "SessionStart";
        // Read-time drift signal: append an advisory note ONLY when a pair is drifted.
        // When clean (or unconfigured) the message stays byte-identical to before.
        try {
          const drift = checkPairs(root, marker.syncPairs);
          if (drift.length) {
            outMsg = messages.compact + "\n\n[never-stale] Possible drift — " + drift.join("\n");
            diag.drift = drift.length;
          }
        } catch {
          outMsg = messages.compact; // fail-safe: plain reminder
        }
      }
    }
  }

  diag.decision = emit ? "fire" : "silent";
  diag.reason = reason || (emit ? "ok" : "");
  dbg(diag);

  if (emit) {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: emit, additionalContext: outMsg } })
    );
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

try {
  main();
} catch {
  // Absolute backstop: a hook must never crash the session.
}
