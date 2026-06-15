// Gate behavior tests for never-stale/hooks/never-stale-gate.js
//
// No dependencies — Node's built-in test runner + assert. Each case spawns the gate
// exactly as a hook would (argv kind, JSON payload on stdin, CLAUDE_PROJECT_DIR env)
// against a throwaway fixture tree under the OS temp dir, then asserts on stdout.
//
// Invariants under test (see the gate's header comment):
//   - it ACTS only when an ancestor up to the git root carries an enabled marker;
//   - the upward walk finds a marker from a subdirectory launch;
//   - it stays silent with no marker, a disabled marker, an out-of-project edit, or
//     a per-event opt-out — and it NEVER exits non-zero or writes to stderr.
//
// Run: node --test test/gate.test.mjs   (or: node test/gate.test.mjs)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, "..", "never-stale", "hooks", "never-stale-gate.js");

// The exact unconfigured reminder strings the gate emits. Pinned here so a refactor
// (e.g. the syncPairs drift work) that drops a clause or changes whitespace fails CI
// instead of staying green — assertFires only matches /\[never-stale\]/, which is not
// enough to guard byte-identity.
const COMPACT_MSG =
  "[never-stale] Auto-compact happened. Re-confirm the rules in CLAUDE.md still apply: " +
  "the language for spoken replies and for written files, and syncing related docs after every code change. " +
  "Re-read CLAUDE.md instead of relying on chat memory.";
const EDIT_MSG =
  "[never-stale] A file was just edited — check whether related docs " +
  "(README / CLAUDE.md / design or spec docs) need to be synced.";

let ROOT; // throwaway fixture root

// Build a fixture tree. Each "repo" gets a .git dir so the upward walk is bounded
// there (a stray marker outside the repo must never govern it).
function repo(name, marker /* object | null */) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  if (marker) {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "never-stale.json"), JSON.stringify(marker));
  }
  return dir;
}

// Write a doc at `rel` inside `dir` with a controllable mtime (epoch ms), so the
// mtime-based drift check is deterministic. Returns the absolute path.
function writeDoc(dir, rel, mtimeMs) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "x\n");
  if (mtimeMs != null) {
    const t = mtimeMs / 1000;
    fs.utimesSync(abs, t, t);
  }
  return abs;
}

before(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ns-gate-"));
});

after(() => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

// Spawn the gate the way a hook does and return { status, stdout, stderr, json }.
function runGate(kind, { projectDir, cwd, filePath } = {}) {
  const payload = {};
  if (cwd) payload.cwd = cwd;
  if (filePath) payload.tool_input = { file_path: filePath };

  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.NEVER_STALE_DEBUG;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;

  const res = spawnSync(process.execPath, [GATE, kind], {
    input: JSON.stringify(payload),
    env,
    encoding: "utf8",
  });

  let json = null;
  const out = (res.stdout || "").trim();
  if (out) {
    try {
      json = JSON.parse(out);
    } catch {
      json = null;
    }
  }
  return { status: res.status, stdout: out, stderr: res.stderr || "", json };
}

// The fail-safe contract applies to every invocation: clean exit, nothing on stderr.
function assertSafe(r) {
  assert.equal(r.status, 0, "gate must exit 0");
  assert.equal(r.stderr, "", "gate must not write to stderr");
}

function assertFires(r, eventName) {
  assertSafe(r);
  assert.ok(r.json, `expected a JSON reminder, got: ${JSON.stringify(r.stdout)}`);
  assert.equal(r.json.hookSpecificOutput.hookEventName, eventName);
  assert.match(r.json.hookSpecificOutput.additionalContext, /\[never-stale\]/);
}

function assertSilent(r) {
  assertSafe(r);
  assert.equal(r.stdout, "", `expected silence, got: ${JSON.stringify(r.stdout)}`);
}

test("compact fires when an enabled marker is at the launch dir", () => {
  const on = repo("on", { enabled: true });
  assertFires(runGate("compact", { projectDir: on }), "SessionStart");
});

test("edit fires for a file inside the opted-in project", () => {
  const on = repo("on-edit", { enabled: true });
  assertFires(
    runGate("edit", { projectDir: on, filePath: path.join(on, "src", "x.ts") }),
    "PostToolUse",
  );
});

test("upward walk: a subdirectory launch still finds the ancestor marker", () => {
  const on = repo("on-subdir", { enabled: true });
  const deep = path.join(on, "packages", "app", "src");
  fs.mkdirSync(deep, { recursive: true });
  assertFires(runGate("compact", { projectDir: deep }), "SessionStart");
});

test("falls back to stdin cwd when CLAUDE_PROJECT_DIR is unset", () => {
  const on = repo("on-stdin", { enabled: true });
  assertFires(runGate("compact", { cwd: on }), "SessionStart");
});

test("silent with no marker anywhere up to the repo root", () => {
  const none = repo("none", null);
  assertSilent(runGate("compact", { projectDir: none }));
});

test("silent when the marker is disabled", () => {
  const off = repo("off", { enabled: false });
  assertSilent(runGate("compact", { projectDir: off }));
});

test("silent when a corrupt marker cannot be parsed (treated as disabled)", () => {
  const dir = path.join(ROOT, "corrupt");
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "never-stale.json"), "{ not json");
  assertSilent(runGate("compact", { projectDir: dir }));
});

test("silent for an edit to a file OUTSIDE the opted-in project", () => {
  const on = repo("on-outside", { enabled: true });
  const outside = path.join(ROOT, "elsewhere.txt");
  assertSilent(runGate("edit", { projectDir: on, filePath: outside }));
});

test("per-event opt-out: events.compact=false silences compact only", () => {
  const dir = repo("no-compact", { enabled: true, events: { compact: false } });
  assertSilent(runGate("compact", { projectDir: dir }));
  assertFires(
    runGate("edit", { projectDir: dir, filePath: path.join(dir, "a.ts") }),
    "PostToolUse",
  );
});

test("per-event opt-out: events.edit=false silences edit only", () => {
  const dir = repo("no-edit", { enabled: true, events: { edit: false } });
  assertSilent(runGate("edit", { projectDir: dir, filePath: path.join(dir, "a.ts") }));
  assertFires(runGate("compact", { projectDir: dir }), "SessionStart");
});

test("silent with no start dir at all (no env, no stdin cwd)", () => {
  assertSilent(runGate("compact", {}));
});

// ---- byte-identity: the unconfigured reminder must be EXACTLY the pinned string ----

test("unconfigured compact reminder is byte-identical to the pinned message", () => {
  const on = repo("byte-compact", { enabled: true });
  const r = runGate("compact", { projectDir: on });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("unconfigured edit reminder is byte-identical to the pinned message", () => {
  const on = repo("byte-edit", { enabled: true });
  const r = runGate("edit", { projectDir: on, filePath: path.join(on, "src", "x.ts") });
  assertFires(r, "PostToolUse");
  assert.equal(r.json.hookSpecificOutput.additionalContext, EDIT_MSG);
});

// ---- syncPairs drift detection (mtime mode) ----

const PAIR = { source: "CHANGELOG.md", snapshot: "STATE.md", mode: "mtime" };

test("compact: drift note appended when the source is newer than the snapshot", () => {
  const dir = repo("drift", { enabled: true, syncPairs: [PAIR] });
  const base = 1_700_000_000_000;
  writeDoc(dir, "STATE.md", base); // snapshot reconciled earlier
  writeDoc(dir, "CHANGELOG.md", base + 10_000); // source edited later -> drift
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.startsWith(COMPACT_MSG), "drift message must still start with the pinned compact reminder");
  assert.match(ctx, /Possible drift/);
  assert.match(ctx, /STATE\.md/);
});

test("compact: NO drift note (byte-identical) when the snapshot is up to date", () => {
  const dir = repo("clean", { enabled: true, syncPairs: [PAIR] });
  const base = 1_700_000_000_000;
  writeDoc(dir, "CHANGELOG.md", base); // source edited earlier
  writeDoc(dir, "STATE.md", base + 10_000); // snapshot reconciled later -> clean
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact: an unsafe (parent-escaping) pair path is ignored, not drift", () => {
  const dir = repo("unsafe-pair", { enabled: true, syncPairs: [{ source: "../evil.md", snapshot: "STATE.md", mode: "mtime" }] });
  writeDoc(dir, "STATE.md", 1_700_000_000_000);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("edit: editing a configured SOURCE retargets the reminder to its snapshot", () => {
  const dir = repo("target-source", { enabled: true, syncPairs: [PAIR] });
  const r = runGate("edit", { projectDir: dir, filePath: path.join(dir, "CHANGELOG.md") });
  assertFires(r, "PostToolUse");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /STATE\.md/);
  assert.match(ctx, /tracked source doc/);
  assert.notEqual(ctx, EDIT_MSG, "a source edit must NOT emit the generic reminder");
});

test("edit: editing a NON-source file still emits the generic reminder verbatim", () => {
  const dir = repo("target-other", { enabled: true, syncPairs: [PAIR] });
  const r = runGate("edit", { projectDir: dir, filePath: path.join(dir, "src", "app.ts") });
  assertFires(r, "PostToolUse");
  assert.equal(r.json.hookSpecificOutput.additionalContext, EDIT_MSG);
});

test("edit: editing the SNAPSHOT also emits the generic reminder (only source retargets)", () => {
  const dir = repo("target-snapshot", { enabled: true, syncPairs: [PAIR] });
  const r = runGate("edit", { projectDir: dir, filePath: path.join(dir, "STATE.md") });
  assertFires(r, "PostToolUse");
  assert.equal(r.json.hookSpecificOutput.additionalContext, EDIT_MSG);
});

test("compact: equal mtimes are clean (byte-identical), not drift", () => {
  const dir = repo("equal-mtime", { enabled: true, syncPairs: [PAIR] });
  const base = 1_700_000_000_000;
  writeDoc(dir, "CHANGELOG.md", base);
  writeDoc(dir, "STATE.md", base); // same mtime -> snapshot is at least as new -> clean
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact: multiple drifted pairs each get their own line", () => {
  const dir = repo("drift-multi", {
    enabled: true,
    syncPairs: [
      { source: "CHANGELOG.md", snapshot: "STATE.md", mode: "mtime" },
      { source: "LEDGER.md", snapshot: "SUMMARY.md", mode: "mtime" },
    ],
  });
  const base = 1_700_000_000_000;
  writeDoc(dir, "STATE.md", base);
  writeDoc(dir, "SUMMARY.md", base);
  writeDoc(dir, "CHANGELOG.md", base + 10_000); // both sources newer -> both drift
  writeDoc(dir, "LEDGER.md", base + 10_000);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.startsWith(COMPACT_MSG), "must still start with the pinned compact reminder");
  assert.match(ctx, /STATE\.md/);
  assert.match(ctx, /SUMMARY\.md/);
  // the two advisory sentences are on separate lines, not run together with a space
  assert.match(ctx, /verify before trusting it\.\nSUMMARY\.md/);
});

test("edit: a source paired with multiple snapshots retargets to all of them", () => {
  const dir = repo("multi-snapshot", {
    enabled: true,
    syncPairs: [
      { source: "CHANGELOG.md", snapshot: "STATE.md", mode: "mtime" },
      { source: "CHANGELOG.md", snapshot: "SUMMARY.md", mode: "mtime" },
    ],
  });
  const r = runGate("edit", { projectDir: dir, filePath: path.join(dir, "CHANGELOG.md") });
  assertFires(r, "PostToolUse");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /STATE\.md/);
  assert.match(ctx, /SUMMARY\.md/);
  assert.match(ctx, /tracked source doc/);
});
