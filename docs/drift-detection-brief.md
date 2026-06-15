# Brief for the never-stale agent — add deterministic drift validation

> Handoff brief. Author: sd-app-provisioning workstream. Grounded in a read of the
> shipped code of `never-stale` **v0.8.0** at
> `~/.claude/plugins/cache/biznuts/never-stale/0.8.0`. Written in English for portability
> to the plugin maintainer/agent. The never-stale agent makes the final design + integration
> decision; this is input, not a mandate.

## 0. Context — the problem to solve

A project keeps two kinds of doc:

- a **ledger** — append-only changelog / master plan (answers *when/why/what changed*), and
- a **snapshot** — a current-state doc (answers *what is true now*).

After splitting them, the snapshot silently goes **stale** relative to the ledger, and the
assistant then trusts stale info (a real failure we hit: resuming from a stale summary and
re-deriving already-settled, already-shipped decisions). `never-stale` is the natural carrier
for preventing this, but today it only **reminds**, it does not **detect**.

## 1. Pain points (confirmed by reading `hooks/never-stale-gate.js`)

| # | Pain point | Root cause |
|---|---|---|
| P1 | **Reminds, never detects → drift stays silent** | The gate only emits static strings (`messages.compact` / `messages.edit`). It reads **no doc and computes nothing**, so it can never say *which* doc is stale. |
| P2 | **Reminder fatigue** | Every `Edit`/`Write` fires the same generic "check your docs" → users habituate → ignore it → produces the exact silent drift the tool exists to stop. |
| P3 | **No pairing concept** | The marker has no "which source ↔ which snapshot" map, so there is nothing to compute drift against. |
| P4 | **No read-time staleness signal** | At session start / post-compact nothing tells the assistant "this snapshot's synced-to has fallen behind" → it trusts a stale snapshot unknowingly (the failure above). |
| P5 | **No end-of-turn guard** | No `Stop` event, so a turn can end "dirty" (ledger touched, snapshot not reconciled). |

Good news: the gate **already** resolves the governing project + marker correctly, and
already extracts `tool_input.file_path`. The only missing half is **deterministic validation**.

## 2. Suggested improvements (backward-compatible: when unconfigured, identical to 0.8.0)

### S1 — Marker-driven sync map
Add an optional `syncPairs[]` to `.claude/never-stale.json`, each entry:

```
{ source, sourceVersionRe, snapshot, snapshotSyncedRe }
```

Pure-regex, **not project-specific**. Absent ⇒ behaviour identical to 0.8.0.

### S2 — A deterministic validator inside the gate (pure `fs` + regex, no LLM)

```js
function parseVer(s){const m=/^v?(\d+(?:\.\d+)*)/.exec(String(s).trim());return m?m[1]:null;}
function cmpVer(a,b){const A=a.split('.').map(Number),B=b.split('.').map(Number);
  for(let i=0;i<Math.max(A.length,B.length);i++){const x=A[i]||0,y=B[i]||0;if(x!==y)return x<y?-1:1;}return 0;}
function maxMatch(file,reStr){try{const re=new RegExp(reStr);let best=null;
  for(const ln of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=re.exec(ln);
    if(m&&m[1]){const v=parseVer(m[1]);if(v&&(!best||cmpVer(v,best)>0))best=v;}}return best;}catch{return null;}}
function checkPairs(root,pairs){const drift=[];
  for(const p of pairs||[]){try{
    const src=maxMatch(path.join(root,p.source),p.sourceVersionRe);   // take MAX -> robust to newest-first OR append ledgers
    const snap=maxMatch(path.join(root,p.snapshot),p.snapshotSyncedRe);
    if(src&&snap&&cmpVer(snap,src)<0)drift.push(`${p.snapshot} synced-to v${snap} < ${p.source} v${src}`);
  }catch{}}return drift;}
```

`maxMatch` takes the **maximum** version found, not the first line — so it is order-robust for
both append ledgers and newest-first ledgers (real-world ledgers often mix: a newest-first
block sitting above an initial chronological block).

### S3 — Emit a computed verdict (replace the generic string)
- drift → `"DRIFT: <snapshot> synced-to v174 < <source> v176 → distrust snapshot; reconcile."`
- clean (on compact) → `"all snapshots current."`

This is what turns *silent* drift into a *loud, computed, unmissable* fact. **Fixes P1 + P4.**

### S4 — Edit-side targeting (kills reminder fatigue)
On the `edit` event, fire the write-side directive **only when `file_path` matches a configured
`source`** ("you touched the ledger → bump `<snapshot>` synced-to + update the affected
section"). If it matches a `snapshot`, stay silent. Otherwise fall back to the (now optional,
suppressible) generic reminder. The gate already extracts `file_path` — reuse it. **Fixes P2.**

### S5 — New optional `Stop` event
Add a `Stop` matcher in `hooks.json` and `events.stop` in the marker; re-run `checkPairs` at
turn end and warn if any pair is drifted, so a turn cannot end dirty. **Fixes P5.**

### S6 — Fail-safe unchanged
Wrap every read/regex in try/catch; on unparseable/missing input, fall back to the existing
static reminder. Honor the file's hard contract: **NEVER throw, exit 0, silent on doubt.**

### Marker schema delta (`marker.schema.json`, both optional + additive)
Add `syncPairs` (the array above) and `events.stop` (boolean).

## 3. Why deterministic-in-hook, not workflow/cron
The per-update guard must run **automatically and for free on every edit/compact**. An LLM
workflow is probabilistic and on-demand — it belongs only to a *separate semantic cross-doc
audit* (finding content contradictions a version-compare cannot see), never to this gate.

## 4. Honest limit (please state in the design)
This enforces the **version-marker invariant** and forces **detection**; it cannot verify the
snapshot's **content** is semantically correct — that still needs an agent. But detection is
~90% of the fix, because the failure mode is silent staleness, not bad reconciliation.

## 5. Boundaries / adjacent note
- The plugin lives in a machine-wide, version-locked cache; **editing it there is lost on
  `never-stale:update`**. These are drop-in patches for the upstream maintainer, or for a
  project-local hook override — do not just edit the cache.
- Adjacent (out of scope, one line): a host project may carry its own reminder-only hook
  (e.g. an `after-compact.ps1`) with the identical limitation — the same validator upgrade
  applies there if never-stale is not adopted as the carrier.
