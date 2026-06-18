# Drift detection — design decision (response to the v0.8.0 improvement brief)

This is a decision record. It responds to the handoff brief
[`drift-detection-brief.md`](./drift-detection-brief.md) (author:
sd-app-provisioning workstream), which proposes adding **deterministic drift detection**
to the gate so it can *detect* a stale snapshot, not merely *remind*. It records what we
adopt, what we change, what we defer, and the risks that gate any of it shipping.

It is reference documentation. Every claim below was checked against the real shipped code of
v0.8.0: `never-stale/hooks/never-stale-gate.js`, `never-stale/hooks/hooks.json`,
`never-stale/marker.schema.json`, `test/gate.test.mjs`, `test/marker.schema.test.mjs`.

> **Status (updated).** **Phase 1 shipped in v0.9.0** (PR #5) — `syncPairs` with `mode: "mtime"`
> only, the read-time drift note on compact, edit-side retargeting, the bounded-work contract,
> the byte-identity test, the dedicated `test/syncpairs.test.mjs` safety suite, and the
> `/never-stale:status` resolution preview. See [`CHANGELOG.md`](../CHANGELOG.md) and the
> `## Advanced: drift detection (syncPairs)` section of [`README.md`](../README.md).
>
> **Phase 2's first increment shipped in v0.10.0** — `mode: "hash"`, a content-based check.
> Rather than the brief's version-regex (the #1 killer risk below), it reuses the snapshot as the
> store: the snapshot embeds a synced-to marker `<!-- never-stale:synced-to <hex> -->` and the gate
> hashes the source's normalized content (a bounded, compact-only read) to detect real content
> drift. This keeps the **zero free-form-regex / zero-ReDoS** property of Phase 1 while removing
> mtime's false signals. The regex-based `version` mode (and `declared`) remain **deferred** — if
> they ship they need the `parseVer` date/pre-release fix and the safe-regex + input-cap mitigations
> below. The verdict and risk analysis below are preserved as written at decision time.

## Verdict — phase it

**Adopt the direction** (deterministic, LLM-free drift detection) and the cheap,
read-time half now. **Reject the brief's "one additive drop-in" packaging.** The brief is
well-grounded and genuinely read the shipped code, but its "all backward-compatible / all
additive" framing is wrong in three concrete, verifiable places, and its default mechanism
(version-regex) is the weakest available choice. Ship a narrow, read-time-only first
increment; gate everything that reads project docs on the *write* path behind explicit
config; defer the `Stop` event.

## The problem (from the brief, restated)

A project keeps two kinds of doc: a **ledger** (append-only changelog/plan — *when/why/what
changed*) and a **snapshot** (current-state doc — *what is true now*). After they are split,
the snapshot silently goes stale relative to the ledger, and the assistant then trusts stale
info (the originating failure: resuming from a stale summary and re-deriving already-settled
decisions). The gate is the natural carrier for preventing this, but today it only **reminds**
(emits two static strings, `never-stale-gate.js:34-42`); it reads no doc and computes nothing,
so it can never say *which* doc is stale.

## The debate, distilled

What the brief got **right** (verified against the code):

- **P1 is accurate.** The gate is purely static: `main()` emits `messages[kind]` verbatim
  (`never-stale-gate.js:163-167`) and reads no project doc. "Reminds, never detects" is true.
- **S1 is genuinely additive at the top level.** `marker.schema.json:7` is
  `"additionalProperties": true`; `marker.schema.test.mjs:105` (`"unknown top-level key is
  allowed"`) proves an unconfigured marker stays byte-identical to 0.8.0. The gate already
  `readJsonSafe`s the marker (`never-stale-gate.js:90`).
- **S4 reuses machinery that already exists.** The gate already extracts the edited path
  (`const edited = ti.file_path || ti.path || ti.notebook_path` at `:146`) and already
  path-gates it with `isInside` (`:148`, helper at `:62-70`).
- **Keeping detection LLM-free is correct** for something on a 5s budget on every edit
  (`hooks.json` `timeout:5`). An LLM in the hot path would violate the fail-safe/latency
  identity outright.

What the brief got **wrong or overstated** (each verified):

1. **`events.stop` is NOT additive.** The brief's delta line calls it "optional + additive."
   But `marker.schema.json:41` sets `events.additionalProperties: false`, and
   `marker.schema.test.mjs:111` (`"unknown event key"`) actively *rejects* unknown event keys.
   Shipping `events.stop` without amending `events.properties` breaks CI. Only the top-level
   `syncPairs` is truly additive — the `events.stop` half is a real schema edit.

2. **The CI guard the design leans on physically cannot validate `syncPairs` items.** The
   schema test's `checkAgainst` (`marker.schema.test.mjs:45-63`) descends only into
   `spec.properties` when `type === "object"` (`:53`); for arrays `typeOk` checks
   `Array.isArray` only (`:31-32`) and there is **no `items` handling anywhere**. So a
   malformed/dangerous `syncPairs` entry (missing `source`, a `..` traversal path, an evil
   regex) passes the committed-marker conformance test (`:132`) silently. Any "fail it in the
   schema/CI" defense is **inert** against this harness. A typed schema block is documentation,
   not protection — the real guard must be a new, dedicated, hand-rolled test.

3. **The chosen mechanism (version-regex) is the brittlest, and the "~90% of the fix"
   self-grade is unsupported.** `parseVer` is `/^v?(\d+(?:\.\d+)*)/`. On a dated ledger entry
   `2026-06-15` it captures `"2026"` (it stops at the `-`); a second entry `2026-07-20` also
   captures `"2026"`, so `cmpVer` returns `0` and the validator reports **"all current"** for a
   stale doc — strictly *worse* than today's harmless nudge, because it actively reassures the
   assistant a stale doc is fresh (the exact failure the plugin exists to stop). It also drops
   pre-release tags (`1.2.0-rc1 == 1.2.0`). The branding honesty rule (`docs/branding.md`,
   "Slogans to avoid (overclaim)") forbids exactly this kind of magnitude overclaim. **Strike
   "~90%."**

4. **`try/catch` (S6) does not bound a runaway regex or a timeout.** S1/S2 compile a
   user-supplied regex with `new RegExp(reStr)` where `reStr` comes from a **committed team
   marker**, then run it over whole-file reads on every edit, machine-wide, under a 5s budget.
   Catastrophic backtracking (ReDoS) is synchronous and uninterruptible inside V8 — no
   exception is thrown, so `try/catch` never fires; the `hooks.json` `timeout:5` is an
   *external kill*, not the contract's clean `exit 0`. So the feature fails invisibly (and the
   developer eats up to a 5s stall per save). "Never throws" is necessary but not sufficient:
   the contract (`never-stale-gate.js:27-29`) needs a **"never hangs / bounded-work"** clause.

5. **S5 does not deliver its headline.** The brief says a `Stop` event makes it so "a turn
   cannot end dirty." Hook-API verification confirms a `Stop` hook *does* support
   `hookSpecificOutput.additionalContext` — but that context is injected only on the **next**
   turn / on resume, *after* Claude has already finished responding. So S5 is a *reminder for
   the next turn*, not a *guard for the current one*. Feasible, but mis-described.

## Per-proposal call

| Proposal | Call | Reason |
|---|---|---|
| **S1** `syncPairs[]` in marker | **Adopt (modified)** | Top-level key is additive (`schema:7`, test:`105`). Add a `mode` discriminator instead of hard-coding `sourceVersionRe`/`snapshotSyncedRe`. Do **not** trust the schema test to validate item shapes — it can't. |
| **S2** pure `fs`+regex validator | **Modify (don't ship as drafted)** | Direction right (no LLM, fits 5s). But version-regex is the weakest backend and free-form regex is a ReDoS vector. Demote to opt-in `mode:"version"`; default to `mtime`; bound input bytes/lines; call `isInside`. |
| **S3** computed verdict | **Adopt — compact/SessionStart only** | Highest value, lowest risk. Emit **only on drift**, suppress the "all current" line, phrase advisory ("possible drift — verify", never "distrust"), keep the `[never-stale]` prefix (`gate.test.mjs:91`). Never on the per-edit path. |
| **S4** edit-side targeting | **Adopt (reworded)** | Reuses `file_path` (`:146`) + `isInside` (`:148`). But the generic edit reminder must stay **unconditionally ON** for non-source edits; "becomes optional/suppressible" as worded would silently delete the doc-sync nudge for any team that configures even one pair. Resolve both paths to absolute before comparing. |
| **S5** `Stop` event | **Defer** | API-feasible (`Stop` supports `additionalContext`, verified), but needs a schema edit, a 3-way `argv` switch (`:112` is binary), is the highest fatigue surface (fires every turn end), and — verified — does **not** make "a turn cannot end dirty": context lands on resume, *after* the turn. It is a reminder, not a guard. |
| **S6** fail-safe unchanged | **Adopt (extended)** | Correct, matches the double backstop (`:44-50`, `:170-174`). But `try/catch` does not bound ReDoS or a 5s timeout. Add a **bounded-work** clause to the contract: input caps + never-hangs, not just never-throws. |

## Killer risks (must be handled before anything ships)

1. **Untrusted-regex ReDoS — HIGH, the one truly novel primitive.** A teammate-committed
   `.claude/never-stale.json` regex runs in every contributor's session, on every edit,
   machine-wide. `try/catch` is inert against it; the 5s timeout is an external kill.
   *Mitigation:* prefer **no free-form regex** — a fixed semver/token grammar or a named-pattern
   enum. If a regex field is kept, add a vendored zero-dep safe-regex static check at marker-
   validation time **plus** hard input caps (line ≤ ~2 KB, lines ≤ ~5000, file ≤ 256 KB).
   Drop the brief-adjacent "internal wall-clock budget" and "regex length cap" ideas — neither
   works (backtracking is uninterruptible; evil regexes are short). Verify the Windows hook
   runner actually kills the node process tree on timeout.

2. **The schema test cannot guard `syncPairs` items — HIGH, invalidates "fail it in CI".**
   `checkAgainst` never descends into arrays (verified above).
   *Mitigation:* a **dedicated, purpose-built test** that asserts each entry's shape, runs the
   safe-regex check on regex fields, and rejects absolute / `..` / UNC / drive-qualified paths.
   Do **not** pull in `ajv` (breaks the zero-dep promise the test header states) — hand-roll the
   item checks.

3. **Path traversal — MED (ranks below ReDoS).** `path.join(root, p.source)` with `..`, an
   absolute path, or a Windows UNC/drive path escapes `root`; the read + emitted verdict can
   leak existence/version-like content.
   *Mitigation:* reject `path.isAbsolute` / `..` / UNC before join, then `path.resolve` and
   require `isInside(root, resolved)` (`:62-70`, currently uncalled by any validator); optional
   `realpathSync` re-check; cap file size. (Below ReDoS because a committer who can edit the
   marker can already commit code the agent runs — this is not a new compute-amplification
   trust boundary the way the regex is.)

4. **P2 default-behavior regression — HIGH, product.** S4-as-worded ("generic reminder becomes
   optional") can silently delete the doc-sync nudge — the product's *other* half — for any team
   that configures one pair.
   *Mitigation:* targeting fires the directive **instead of** the generic one *only when
   `file_path` matches a configured source*; every other in-project edit emits the generic
   reminder **verbatim and unchanged** (preserve `:149` behavior). Add a test for it.

5. **Untested byte-identity — MED.** Green CI does not prove the unconfigured reminder is
   unchanged: `gate.test.mjs`'s `assertFires` only matches `/\[never-stale\]/`, and the gate's
   strings (`:34-42`) are long and multi-clause, so an S3 refactor can drop a clause and stay
   green.
   *Mitigation:* a string-equality test on the unconfigured `compact` and `edit`
   `additionalContext`; the unconfigured branch must `return messages[kind]` (the literal
   constant), never a reconstructed string.

6. **Silent misconfiguration — MED, product.** A valid regex with a wrong/absent capture group
   returns `null` → silent no-op, indistinguishable from "clean" — the worst UX for a "make
   silent drift loud" tool.
   *Mitigation:* surface a resolution preview in `/never-stale:status` (the read-only command
   already exists): for each pair, show the value currently extracted from source and snapshot,
   or "no match — check your config."

## Recommended phased plan

**Phase 1 — ✅ SHIPPED in v0.9.0 (PR #5)** (low risk, reuses existing code, identity-preserving):

- **S1** top-level `syncPairs[]` with a `mode` discriminator (default the cheapest zero-config
  backend, `mtime`; `version` is opt-in only).
- **S3 on compact/SessionStart only**, emitting **only on drift**, advisory phrasing,
  `[never-stale]` prefix retained.
- **S4** edit-side targeting with the generic reminder unconditionally preserved for non-source
  edits.
- **S6** extended with the bounded-work clause.
- The byte-identity equality test **and** the dedicated `syncPairs` item-shape / safe-regex /
  path-rejection test. *These gate Phase 1 — they are not a follow-up.*
- The `/never-stale:status` resolution preview (risk #6).

**Phase 2 — guarded, behind config, after Phase 1 proves the model:**

- ✅ **SHIPPED in v0.10.0: `mode: "hash"`** — a content-based check that sidesteps the
  version-regex risk entirely. The snapshot declares the source content it reconciled to via a
  synced-to marker; the gate hashes the source's normalized content (a bounded, size-capped,
  compact-only read) and compares. No free-form regex (the synced-to marker is matched with a
  static gate-owned pattern), so the #1 killer risk never materializes; no per-edit read.
- **Deferred: `version` mode** — the regex write-path validator for richer modes, with all input
  bounds and path confinement. Keep version-regex opt-in only, and fix `parseVer`'s date/pre-release
  handling (or reject ambiguous date-shaped input) before it ships at all.

**Defer indefinitely / keep out of the gate entirely:**

- **S5 (`Stop` event)** — only after the schema is amended, the `argv` switch is made 3-way with
  a spawn test, it is default-**off**, and it fires only on a within-turn clean→drift
  transition. Reframe its goal as "remind on resume," not "guard the turn."
- **Semantic / multi-pair cross-doc audit** → a separate `/never-stale:check` verb, where
  latency and config richness are free. The gate keeps *only* the cheap automatic read-time
  verdict.
- **Do not** ship via a project-local hook override — that reintroduces the per-project
  executable code v0.6.0 deliberately removed, and breaks the clean-uninstall promise. Land
  upstream in the plugin.

## Concrete deltas

### `marker.schema.json`

Add a typed top-level `syncPairs` (so the *published* schema is honest, even though the current
test can't enforce `items`):

```json
"syncPairs": {
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["source", "snapshot"],
    "properties": {
      "source":            { "type": "string", "maxLength": 256 },
      "snapshot":          { "type": "string", "maxLength": 256 },
      "mode":              { "type": "string", "enum": ["mtime", "hash", "declared", "version"], "default": "mtime" },
      "sourceVersionRe":   { "type": "string", "maxLength": 200 },
      "snapshotSyncedRe":  { "type": "string", "maxLength": 200 }
    }
  }
}
```

For S5 later, add under `events.properties` — and keep `events.additionalProperties: false`:

```json
"stop": { "type": "boolean", "default": false }
```

Note `default: false` (opt-in), not `true`. **This is a real schema edit, not an additive
no-op.** Critically: the existing `marker.schema.test.mjs` validator will **not** enforce the
`items` block above — it is documentation. The real guard is the new dedicated test below.

### Safest validator shape (gate-side sketch)

```
checkPairs(root, pairs):
  if !Array.isArray(pairs) || !pairs.length: return []      // byte-identical path
  drift = []
  for p of pairs:
    try:
      // path confinement BEFORE any fs touch
      if isAbsolute(p.source) || hasDotDot(p.source) || isUNC(p.source): continue
      src = resolve(join(root, p.source))
      if !isInside(root, src): continue
      if statSize(src) > MAX_BYTES: continue                // bounded — never whole-file unconditionally
      // mode dispatch:
      //   mtime    -> stat() compare only (no read, no regex)  [default]
      //   version  -> bounded read + SAFE regex only           [opt-in]
      ...
    catch: continue                                          // per-pair isolation; never throws out
  return drift
```

The default path returns `[]` immediately → the caller emits the literal `messages[kind]`.

### Docs and tests implied

- **CLAUDE.md doc-sync rule (this repo's own rule).** After the code lands, sync the README
  (an *advanced / opt-in* section, **below the fold** — do not touch the hero, the slogans, or
  the three flagship use cases), the marker-schema doc, and any spec. State plainly which docs
  were updated and which were not.
- **Branding voice.** Verdict text must read "the synced-to marker is behind / possible drift —
  verify," never "the snapshot is wrong" or "distrust it." The honesty rule applies to the
  *value* claim too — strike "~90% of the fix."
- **`gate.test.mjs` cases to add:** (1) exact-string equality for the unconfigured `compact` +
  `edit` reminders; (2) `syncPairs` configured + edit to a *non-source* file → the unchanged
  generic reminder still fires; (3) `syncPairs` configured + edit to a *source* file → the
  targeted directive; (4) drift present on compact → drift verdict carrying the `[never-stale]`
  prefix; (5) clean on compact → silent; (6) [Phase 2] traversal / UNC / absolute path in
  `source` → silent no-op; (7) [S5] `runGate('stop', …)` asserting `hookEventName: 'Stop'` and
  silence with no marker.
- **A new dedicated schema/safety test** (separate from the array-blind existing harness):
  per-item shape + safe-regex + path rejection.

## Claude Code hook-API facts (verified)

- **`Stop` supports `additionalContext`** — confirmed. But the context is injected on the next
  turn / on resume, *after* Claude finishes responding. S5 is a resume-time reminder, not a
  same-turn guard.
- **`PostToolUse` supports `additionalContext`** — confirmed; the shipped gate already uses it
  (`never-stale-gate.js:165`, asserted by `gate.test.mjs:90-91`). S3/S4 ride on this.
- **`SessionStart` (matcher `compact`) `additionalContext` reaches the model** as a
  system-reminder in the context window after auto-compaction — confirmed (this is the v0.8.0
  behavior). This is why S3 belongs on the compact path: automatic, low-frequency, no per-edit
  DoS surface, comfortably inside 5s.
- **`Stop` infinite-loop risk** is gated by `stop_hook_active`; since the gate would emit only
  `additionalContext` (never `decision: "block"`), it cannot loop.

## Honest limits to state in the design

- Detects a **version/sync-marker invariant only** — "did the source move since the snapshot
  last declared it reconciled?" It **cannot verify semantic correctness**: a snapshot can carry
  a current version stamp and still be wrong prose, and the gate will call it clean.
- The `version` mode is **brittle on real ledgers** (dates collapse to the year; pre-release
  tags drop), producing **false "clean."** It is not the default and must be documented as
  "requires a tested, semver-shaped version stamp in both docs."
- This detects **version-marker drift, not staleness in general** — most prose snapshots carry
  no extractable version. It is a **niche power-user feature**, not a headline capability.
- The verdict is **advisory, never authoritative** ("possible drift — verify"): a mismatched
  regex can capture a version from a code sample or a dependency line and be confidently wrong.
- Fail-safe means **silent on any doubt** — including a misconfigured pair, which is why the
  `/never-stale:status` resolution preview is required so silent non-detection is at least
  diagnosable.

---

**Net.** The detection idea is worth adopting and the brief honestly read the real gate. Its
packaging is not safe as-is: it overstates backward-compat (`events.stop`), proposes mitigations
that do not work (wall-clock budget, regex-length cap), leans on a CI guard that physically
cannot validate the new data (the array-blind schema test), commits to the most brittle
mechanism (version-regex), and as-worded can silently delete the product's other half (the
generic doc-sync nudge). Ship the cheap, automatic, read-time slice now behind real tests; fence
the engine; defer the `Stop` event.
