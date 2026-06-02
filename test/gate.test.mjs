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
