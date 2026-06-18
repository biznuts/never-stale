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
import crypto from "node:crypto";
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

// Write exact text at `rel` inside `dir`. Returns the absolute path. Used by the
// hash-mode cases where the bytes (not the mtime) are what matters.
function writeText(dir, rel, text) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  return abs;
}

// Mirror of the gate's normalize + SHA-256 (see never-stale-gate.js), so a test can
// compute the synced-to hash a snapshot should carry to be considered reconciled. Uses
// the same LINEAR char scans the gate uses (not trailing-anchored regexes), so the
// value matches exactly.
function normalizeForHash(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let e = l.length;
    while (e > 0 && (l.charCodeAt(e - 1) === 32 || l.charCodeAt(e - 1) === 9)) e--;
    if (e !== l.length) lines[i] = l.slice(0, e);
  }
  const joined = lines.join("\n");
  let a = 0;
  let b = joined.length;
  while (a < b && joined.charCodeAt(a) === 10) a++;
  while (b > a && joined.charCodeAt(b - 1) === 10) b--;
  return joined.slice(a, b);
}
function syncHash(text, len = 16) {
  return crypto.createHash("sha256").update(normalizeForHash(text)).digest("hex").slice(0, len);
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

// ---- syncPairs drift detection (hash mode) ----

const HASH_PAIR = { source: "CHANGELOG.md", snapshot: "STATE.md", mode: "hash" };
const SRC_TEXT = "# Changelog\n\n- first\n- second\n";

test("compact (hash): clean when the snapshot's synced-to mark matches the source", () => {
  const dir = repo("hash-clean", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", SRC_TEXT);
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT)} -->\nup to date\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact (hash): drift when the source content changed since the synced-to mark", () => {
  const dir = repo("hash-drift", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", SRC_TEXT + "- third\n"); // source moved on
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT)} -->\nstale\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.startsWith(COMPACT_MSG), "drift message must still start with the pinned compact reminder");
  assert.match(ctx, /Possible drift/);
  assert.match(ctx, /STATE\.md/);
  assert.match(ctx, /synced-to mark/);
});

test("compact (hash): CRLF and trailing whitespace in the source are not drift", () => {
  const dir = repo("hash-normalize", { enabled: true, syncPairs: [HASH_PAIR] });
  // synced-to recorded against the clean text; source differs only cosmetically
  writeText(dir, "CHANGELOG.md", SRC_TEXT.replace(/\n/g, "  \r\n"));
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT)} -->\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact (hash): a snapshot with no synced-to marker is unknown, not drift", () => {
  const dir = repo("hash-nomark", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", SRC_TEXT);
  writeText(dir, "STATE.md", "# State\n\nno synced-to marker here\n");
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact (hash): an oversized source is skipped (unknown), not drift", () => {
  const dir = repo("hash-oversize", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", "x\n".repeat(300_000)); // > 512 KB cap
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT)} -->\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact (hash): a short synced-to prefix still matches the source", () => {
  const dir = repo("hash-shortprefix", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", SRC_TEXT);
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT, 8)} -->\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("edit (hash): editing the source still retargets to the snapshot", () => {
  const dir = repo("hash-edit", { enabled: true, syncPairs: [HASH_PAIR] });
  const r = runGate("edit", { projectDir: dir, filePath: path.join(dir, "CHANGELOG.md") });
  assertFires(r, "PostToolUse");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /STATE\.md/);
  assert.match(ctx, /synced-to marker/);
});

test("compact (hash): a full 64-hex synced-to value matches", () => {
  const dir = repo("hash-64", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", SRC_TEXT);
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT, 64)} -->\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact (hash): an UPPERCASE synced-to value still matches (case-insensitive)", () => {
  const dir = repo("hash-upper", { enabled: true, syncPairs: [HASH_PAIR] });
  writeText(dir, "CHANGELOG.md", SRC_TEXT);
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT).toUpperCase()} -->\n`);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  assert.equal(r.json.hookSpecificOutput.additionalContext, COMPACT_MSG);
});

test("compact (hash): a long single whitespace line is normalized in linear time (no ReDoS)", () => {
  const dir = repo("hash-redos", { enabled: true, syncPairs: [HASH_PAIR] });
  // 300 KB single line of spaces + a trailing non-space char: the input that makes a
  // trailing-anchored `/[ \t]+$/` regex O(n^2). Under the 512 KB cap, so it IS read and
  // hashed — the gate must still return promptly.
  writeText(dir, "CHANGELOG.md", " ".repeat(300 * 1024) + "x");
  writeText(dir, "STATE.md", "# State\n\n<!-- never-stale:synced-to 0000000000000000 -->\n");
  const t0 = Date.now();
  const r = runGate("compact", { projectDir: dir });
  const elapsed = Date.now() - t0;
  assertFires(r, "SessionStart"); // drift (hash won't match) but must not hang
  assert.ok(elapsed < 5000, `normalize must be linear; took ${elapsed}ms`);
});

test("compact: a hash pair and an mtime pair coexist, each judged on its own", () => {
  const dir = repo("mixed-mode", {
    enabled: true,
    syncPairs: [
      { source: "CHANGELOG.md", snapshot: "STATE.md", mode: "hash" },
      { source: "LEDGER.md", snapshot: "SUMMARY.md", mode: "mtime" },
    ],
  });
  const base = 1_700_000_000_000;
  // hash pair: clean (snapshot records the current source hash)
  writeText(dir, "CHANGELOG.md", SRC_TEXT);
  writeText(dir, "STATE.md", `# State\n\n<!-- never-stale:synced-to ${syncHash(SRC_TEXT)} -->\n`);
  // mtime pair: drift (source newer than snapshot)
  writeDoc(dir, "SUMMARY.md", base);
  writeDoc(dir, "LEDGER.md", base + 10_000);
  const r = runGate("compact", { projectDir: dir });
  assertFires(r, "SessionStart");
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Possible drift/);
  assert.match(ctx, /SUMMARY\.md/); // mtime pair drifted
  assert.ok(!ctx.includes("STATE.md"), "the clean hash pair must not appear as drift");
});

// --- S1: the documented body-hash one-liner must stay linear and gate-consistent ----
//
// /never-stale:setup and :status ship a `node -e "..."` snippet that recomputes the
// CLAUDE.md fence body hash. It MUST use the same linear char-scan normalize the gate
// uses — never the trailing-anchored `/\s+$/` (or `/^\n+|\n+$/g`), which backtracks
// catastrophically on a long non-matching run (measured ~21.6 s on a 200 KB space line)
// and contradicts the gate's own normalize() comment. This guard extracts the REAL
// shipped line, runs it, and asserts both its output hash and its runtime.
const CMD_DIR = path.join(HERE, "..", "never-stale", "commands");

function extractBodyHashOneLiner(file) {
  const text = fs.readFileSync(path.join(CMD_DIR, file), "utf8");
  assert.ok(!text.includes("\\s+$"), `${file}: ReDoS-class /\\s+$/ regex must not reappear`);
  assert.ok(!text.includes("\\n+$/g"), `${file}: ReDoS-class /^\\n+|\\n+$/g trim must not reappear`);
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("node -e ") && l.endsWith('" <bodyfile>'));
  assert.ok(line, `${file}: documented body-hash one-liner not found`);
  const m = /^node -e "(.*)" <bodyfile>$/.exec(line);
  assert.ok(m, `${file}: body-hash one-liner has an unexpected shape`);
  return m[1];
}

test("docs (S1): the shipped body-hash one-liner hash-matches the gate's normalize", () => {
  // A body exercising every branch: CRLF, trailing spaces AND tabs, leading/trailing
  // and internal blank lines.
  const body =
    "\r\n\r\n## Language  \r\n- spoken   \t\r\n\r\n- written\t\t\r\n## Doc\r\n- sync \r\n\r\n\r\n";
  const bodyFile = writeText(ROOT, "fence-body.md", body);
  const expected = syncHash(body); // gate-mirror normalize + sha256, first 16 hex
  for (const file of ["setup.md", "status.md"]) {
    const script = extractBodyHashOneLiner(file);
    const r = spawnSync(process.execPath, ["-e", script, bodyFile], { encoding: "utf8" });
    assert.equal(r.status, 0, `${file}: one-liner exited non-zero: ${r.stderr}`);
    assert.equal(r.stdout, expected, `${file}: documented one-liner hash drifted from the gate`);
  }
});

test("docs (S1): the shipped body-hash one-liner is linear (no ReDoS hang)", () => {
  const evilFile = writeText(ROOT, "fence-evil.md", " ".repeat(200 * 1024) + "x");
  const script = extractBodyHashOneLiner("setup.md");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["-e", script, evilFile], { encoding: "utf8" });
  const elapsed = Date.now() - t0;
  assert.equal(r.status, 0, `one-liner exited non-zero: ${r.stderr}`);
  assert.ok(elapsed < 5000, `documented one-liner must be linear; took ${elapsed}ms`);
});
