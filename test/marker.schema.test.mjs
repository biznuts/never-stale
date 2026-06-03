// Conformance tests for the opt-in marker against never-stale/marker.schema.json.
//
// The repo ships zero runtime dependencies, so rather than pull in a JSON Schema
// engine (ajv) we use a small validator that is *driven by the schema file* — it
// reads `required`, `properties` (type/const), and `additionalProperties` straight
// out of marker.schema.json. It covers exactly the constraints this flat, one-level
// schema expresses; it is NOT a full draft-07 implementation.
//
// Both sides are tested: valid fixtures must pass and deliberately-broken ones must
// be rejected (a validator that always returns OK is worse than none). Finally, the
// repo's own committed marker is checked, so a bad hand-edit fails CI.
//
// Run: node --test test/marker.schema.test.mjs   (or: node --test test/*.test.mjs)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "never-stale", "marker.schema.json"), "utf8"),
);
const COMMITTED_MARKER = path.join(HERE, "..", ".claude", "never-stale.json");

function typeOk(val, type) {
  switch (type) {
    case "object":
      return typeof val === "object" && val !== null && !Array.isArray(val);
    case "array":
      return Array.isArray(val);
    case "string":
      return typeof val === "string";
    case "boolean":
      return typeof val === "boolean";
    case "number":
      return typeof val === "number";
    default:
      return true;
  }
}

// Validate `val` against a (sub)schema spec, accumulating dotted-path errors.
function checkAgainst(name, val, spec, errors) {
  if (spec.const !== undefined && val !== spec.const) {
    errors.push(`${name}: must equal ${JSON.stringify(spec.const)}`);
  }
  if (spec.type && !typeOk(val, spec.type)) {
    errors.push(`${name}: expected ${spec.type}, got ${Array.isArray(val) ? "array" : typeof val}`);
    return; // wrong type — don't descend
  }
  if (spec.type === "object" && spec.properties) {
    for (const [k, v] of Object.entries(val)) {
      const sub = spec.properties[k];
      if (!sub) {
        if (spec.additionalProperties === false) errors.push(`${name}.${k}: property not allowed`);
        continue;
      }
      checkAgainst(`${name}.${k}`, v, sub, errors);
    }
  }
}

function validate(schema, obj) {
  const errors = [];
  if (!typeOk(obj, "object")) return { ok: false, errors: ["root: not an object"] };

  for (const r of schema.required || []) {
    if (!(r in obj)) errors.push(`missing required property: ${r}`);
  }
  const props = schema.properties || {};
  for (const [key, val] of Object.entries(obj)) {
    const spec = props[key];
    if (!spec) {
      if (schema.additionalProperties === false) errors.push(`unknown property: ${key}`);
      continue; // top-level additionalProperties is true → extra keys allowed
    }
    checkAgainst(key, val, spec, errors);
  }
  return { ok: errors.length === 0, errors };
}

// name, marker, shouldPass — note enabled:false is schema-VALID (it just means the
// gate treats the project as disabled); schema validity is not the same as "armed".
const cases = [
  ["minimal valid", { enabled: true }, true],
  ["disabled is still schema-valid", { enabled: false }, true],
  [
    "full valid",
    {
      $schema: "never-stale/marker@1",
      enabled: true,
      version: "0.8.0",
      spoken: "Traditional Chinese (Hong Kong)",
      spokenCode: "zh-HK",
      written: "English",
      writtenCode: "en",
      events: { compact: true, edit: true },
      createdAt: "2026-06-02",
    },
    true,
  ],
  ["one event turned off", { enabled: true, events: { compact: false } }, true],
  ["unknown top-level key is allowed", { enabled: true, note: "hi" }, true],
  ["language codes are valid", { enabled: true, spokenCode: "zh-HK", writtenCode: "en" }, true],
  // invalid:
  ["enabled as string", { enabled: "true" }, false],
  ["non-string language code", { enabled: true, spokenCode: 123 }, false],
  ["missing enabled", { version: "0.6.0" }, false],
  ["unknown event key", { enabled: true, events: { bogus: true } }, false],
  ["non-boolean event value", { enabled: true, events: { edit: "no" } }, false],
  ["wrong $schema const", { enabled: true, $schema: "something-else" }, false],
  ["events is not an object", { enabled: true, events: "both" }, false],
  ["version is not a string", { enabled: true, version: 6 }, false],
  ["root is not an object", [], false],
];

for (const [name, marker, shouldPass] of cases) {
  test(`schema: ${name} → ${shouldPass ? "accept" : "reject"}`, () => {
    const res = validate(SCHEMA, marker);
    assert.equal(
      res.ok,
      shouldPass,
      shouldPass
        ? `expected to pass but got: ${res.errors.join("; ")}`
        : `expected to be rejected but it passed`,
    );
  });
}

test("the repo's committed marker conforms to the schema", () => {
  assert.ok(fs.existsSync(COMMITTED_MARKER), "committed marker .claude/never-stale.json is missing");
  const marker = JSON.parse(fs.readFileSync(COMMITTED_MARKER, "utf8"));
  const res = validate(SCHEMA, marker);
  assert.ok(res.ok, `committed marker violates the schema: ${res.errors.join("; ")}`);
});
