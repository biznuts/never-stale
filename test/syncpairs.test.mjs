// Dedicated safety/shape tests for marker `syncPairs` entries.
//
// WHY THIS FILE EXISTS, separate from marker.schema.test.mjs: that suite's validator
// (`checkAgainst`) is a flat, one-level checker — it descends only into object
// `properties`, and arrays are checked with `Array.isArray` ONLY, never their ITEMS.
// So a malformed or DANGEROUS syncPairs entry (missing field, parent-escaping path,
// ReDoS-prone regex) passes the schema suite silently. This file is the real guard for
// syncPairs item shape + path safety + (forward-looking) regex safety. It is
// hand-rolled and zero-dependency, to keep the no-dependency promise the schema test
// header states (no ajv).
//
// The path rules here MUST match the gate's own `isUnsafeRel` (never-stale-gate.js):
// a pair path is repo-relative; absolute / drive-qualified / UNC / parent-escaping
// paths are rejected. The regex rules are forward-looking — mode:"version" is not
// implemented in v0.9.0, but its regex fields must be safe BEFORE that mode ships.
//
// Run: node --test test/syncpairs.test.mjs   (or: node --test test/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED_MARKER = path.join(HERE, "..", ".claude", "never-stale.json");

const MODES = ["mtime", "hash", "declared", "version"];

// Mirror of the gate's path-safety contract.
function isUnsafeRel(rel) {
  if (typeof rel !== "string" || !rel) return true;
  if (path.isAbsolute(rel)) return true;
  if (/^[a-zA-Z]:/.test(rel)) return true; // drive-qualified
  if (rel.startsWith("\\\\") || rel.startsWith("//")) return true; // UNC
  if (rel.split(/[\\/]+/).includes("..")) return true; // parent escape
  return false;
}

// Conservative, static ReDoS heuristic for the reserved regex fields. It flags the
// classic catastrophic-backtracking shape: a group that contains a quantifier and is
// ITSELF quantified, e.g. (a+)+, (a*)*, (.*)+, (\d+)*. It is intentionally strict —
// a few safe regexes may be rejected, but no obviously-dangerous one is accepted. A
// regex that does not even compile is also unsafe.
function looksUnsafeRegex(src) {
  if (typeof src !== "string" || src.length > 200) return true;
  try {
    new RegExp(src);
  } catch {
    return true;
  }
  // a parenthesised group containing + * or {n,} that is then quantified by + * or {n,}
  if (/\([^)]*(?:[+*]|\{\d+,?\d*\})[^)]*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(src)) return true;
  return false;
}

// Validate one syncPairs entry. Returns { ok, errors }.
function validatePair(p) {
  const errors = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, errors: ["not an object"] };

  for (const key of ["source", "snapshot"]) {
    const v = p[key];
    if (typeof v !== "string" || !v) errors.push(`${key}: required non-empty string`);
    else if (v.length > 256) errors.push(`${key}: exceeds 256 chars`);
    else if (isUnsafeRel(v)) errors.push(`${key}: unsafe path (absolute / drive / UNC / ..)`);
  }

  if (p.mode !== undefined && !MODES.includes(p.mode)) errors.push(`mode: must be one of ${MODES.join(", ")}`);

  for (const key of ["sourceVersionRe", "snapshotSyncedRe"]) {
    if (p[key] !== undefined) {
      if (typeof p[key] !== "string") errors.push(`${key}: must be a string`);
      else if (looksUnsafeRegex(p[key])) errors.push(`${key}: unsafe or uncompilable regex`);
    }
  }

  // No unknown keys (mirrors the schema's additionalProperties:false on the item).
  const allowed = new Set(["source", "snapshot", "mode", "sourceVersionRe", "snapshotSyncedRe"]);
  for (const k of Object.keys(p)) if (!allowed.has(k)) errors.push(`unknown property: ${k}`);

  return { ok: errors.length === 0, errors };
}

const long = "a/".repeat(130) + "x.md"; // > 256 chars

// name, pair, shouldPass
const cases = [
  ["minimal valid", { source: "CHANGELOG.md", snapshot: "docs/STATE.md" }, true],
  ["valid with mtime mode", { source: "a.md", snapshot: "b.md", mode: "mtime" }, true],
  [
    "valid version-mode shape (mode not yet active, but shape must be sound)",
    { source: "a.md", snapshot: "b.md", mode: "version", sourceVersionRe: "v(\\d+\\.\\d+)", snapshotSyncedRe: "synced-to (\\d+\\.\\d+)" },
    true,
  ],
  ["nested subpath snapshot", { source: "docs/ledger.md", snapshot: "docs/state/now.md" }, true],
  // invalid — shape:
  ["missing snapshot", { source: "a.md" }, false],
  ["missing source", { snapshot: "b.md" }, false],
  ["non-string snapshot", { source: "a.md", snapshot: 123 }, false],
  ["unknown property", { source: "a.md", snapshot: "b.md", extra: 1 }, false],
  ["bad mode", { source: "a.md", snapshot: "b.md", mode: "bogus" }, false],
  ["overlong source", { source: long, snapshot: "b.md" }, false],
  // invalid — path safety (must match the gate's silent-ignore set):
  ["absolute source", { source: "/etc/passwd", snapshot: "b.md" }, false],
  ["parent-escaping source", { source: "../secrets.md", snapshot: "b.md" }, false],
  ["drive-qualified source", { source: "C:\\Windows\\x.md", snapshot: "b.md" }, false],
  ["UNC source", { source: "\\\\server\\share\\x.md", snapshot: "b.md" }, false],
  ["parent-escaping snapshot", { source: "a.md", snapshot: "../../x.md" }, false],
  // invalid — regex safety (forward-looking for version mode):
  ["ReDoS regex (a+)+", { source: "a.md", snapshot: "b.md", mode: "version", sourceVersionRe: "(a+)+$" }, false],
  ["ReDoS regex (.*)*", { source: "a.md", snapshot: "b.md", mode: "version", snapshotSyncedRe: "(.*)*x" }, false],
  ["uncompilable regex", { source: "a.md", snapshot: "b.md", mode: "version", sourceVersionRe: "v(\\d+" }, false],
];

for (const [name, pair, shouldPass] of cases) {
  test(`syncPairs item: ${name} → ${shouldPass ? "accept" : "reject"}`, () => {
    const res = validatePair(pair);
    assert.equal(
      res.ok,
      shouldPass,
      shouldPass ? `expected to pass but got: ${res.errors.join("; ")}` : `expected to be rejected but it passed`,
    );
  });
}

test("if the repo's committed marker declares syncPairs, every entry is valid", () => {
  if (!fs.existsSync(COMMITTED_MARKER)) return; // nothing to check
  const marker = JSON.parse(fs.readFileSync(COMMITTED_MARKER, "utf8"));
  if (!Array.isArray(marker.syncPairs)) return; // the repo does not use syncPairs (fine)
  for (const [i, p] of marker.syncPairs.entries()) {
    const res = validatePair(p);
    assert.ok(res.ok, `committed syncPairs[${i}] is invalid: ${res.errors.join("; ")}`);
  }
});
