# Branding & landing-page notes

This file records the decisions behind the README landing page, the image assets, and
the product slogans, so they stay consistent as the project evolves. It is reference
documentation — changing it does not change any behavior.

## Landing-page strategy

The README's top (above the fold) is optimized so a first-time visitor **understands
what never-stale does in a few seconds and feels that it is trivial to try**. Order:

1. **Logo + name + one-line value prop** — benefit-led, not mechanism-led.
2. **Hero = a before/after still** (`assets/hero.png`). The money shot: same session,
   same prompt, just after an auto-compact — *without* never-stale the assistant drifts
   (slips back to English, leaves docs unsynced); *with* it, your rules hold. One glance
   communicates the value; no diagram-reading required.
3. **"Get started in 3 steps"** — the install commands as a **copy-pasteable text
   block** (never an image — people must be able to copy it), ending in
   `/never-stale:setup`.
4. **Removal, right next to install** — `/never-stale:remove` (reversible) and
   `/plugin uninstall`. Making teardown this visible is deliberate: people try a tool
   more readily when leaving is obviously easy.
5. **Everything mechanism-related lives below the fold** — Why, Use cases, How it
   works, the verb state-machine diagram, Lifecycle, FAQ. Reassurance for the curious,
   not the hook.

Principle: **lead with the feeling, defer the mechanism.** The hero shows the outcome;
the "how" (gate, marker, upward walk, sentinels, state machine) is for readers who
scroll.

## Image assets

All images are hand-authored **SVG** (the source of truth, committed alongside the
PNG) and rasterized to **PNG** with `sharp-cli`. Shared palette: background `#0d1117`,
Claude orange `#d97757` / `#e0936f`, green `#3fb950` / `#7ee787`, red `#f85149`, text
`#c9d1d9`, dim `#6e7681`, monospace type. The "window" assets reuse a terminal-chrome
frame (rounded `#0d1117` panel, `#161b22` title bar, three traffic-light dots).

| Asset | Shows | Used in |
|-------|-------|---------|
| `assets/icon.svg` / `.png` | Logo — a refresh ring around three "rule" lines (top line orange = the language rule). 512×512 squircle. | README header; GitHub branding. **Not** in the `/plugin` UI — the plugin/marketplace manifests have no icon field. |
| `assets/social-preview.svg` / `.png` | 1280×640 banner — bare glyph + `never-stale` wordmark + tagline on the dark background. | GitHub **Social preview** (must be uploaded manually under repo Settings — no API/CLI for it). |
| `assets/hero.png` (`hero.svg`) | Before/after still: rules drift vs. rules held, after an auto-compact. | README hero (above the fold). |
| `assets/commands.svg` / `.png` | State machine of the verb subcommands: `setup` opts in (gate fires); `off`/`on` pause/resume; `remove` tears down; `update` reconciles bookkeeping; `status`/`list` are read-only. | README `Lifecycle` section (below the fold). |
| `assets/manage.svg` / `.png` | Cheat sheet for the management verbs, grouped: `off`/`on` (pause · reversible), `remove` + `--dry-run` (teardown), `list` (find projects). | README `Pausing or removing it from a project` section. |
| `assets/demo.svg` / `.png` | Hand-drawn terminal: the `[never-stale]` reminders firing after a compact and after an edit. | README `How it works` section. |
| `assets/case1-language` · `case2-team` · `case3-monorepo` | The three use-case scenarios. | README `Use cases`. |

### Rendering an SVG to PNG

`sharp-cli` keeps the input basename, so render into a **separate** output directory to
avoid overwriting the `.svg` source, then move the result:

```bash
cd assets
mkdir _r
npx --yes sharp-cli@latest -i hero.svg -o _r -f png resize 760 318
mv -f _r/hero.png ./hero.png && rm -rf _r
```

## Slogans

Chosen, and where each is used:

- **Banner tagline:** `Rules that survive auto-compact.`
- **README hero line:** `Set the rules once — they stay in front of Claude all session.`
- **README punch line:** `Keep CLAUDE.md in front of Claude.`
- **GitHub repo description:** `Project rules that survive every auto-compact — keep
  CLAUDE.md in front of Claude. A Claude Code plugin.`

Other accurate options kept in reserve: "No drift. No re-explaining." ·
"Compaction-proof project rules." · "Your conventions, never forgotten mid-session." ·
"No more forgotten rules." · "Stick to your conventions, start to finish."

### Slogans to avoid (overclaim)

- **"No more hallucination"** — never-stale does **not** reduce hallucination. It
  re-injects your `CLAUDE.md` rules after compaction so the assistant does not drift
  from your conventions. Claiming it prevents hallucination is inaccurate and costs
  credibility with a technical audience. Use "no more forgotten rules" instead.
- **"Keep your memory forever"** — "forever" overpromises. never-stale keeps your rules
  alive **within a session, surviving auto-compact** — it is not a persistent memory
  store. Use "rules that survive every compaction" instead.

Honesty rule: slogans describe **rule persistence / anti-drift**, never broad
capability claims the gate does not deliver.
