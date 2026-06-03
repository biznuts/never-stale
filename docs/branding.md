# Branding & landing-page notes

This file records the decisions behind the README landing page, the image assets, and
the product slogans, so they stay consistent as the project evolves. It is reference
documentation — changing it does not change any behavior.

## Landing-page strategy

The README's top (above the fold) is optimized so a first-time visitor **understands
what never-stale does in a few seconds and feels that it is trivial to try**. Order:

1. **Banner** (`assets/banner.png`) — a wide 1280×300 brand banner (logo glyph +
   `never-stale` wordmark + tagline `Set once. Never drifts.`) shown at width 880,
   replacing the old standalone 120px icon so a visitor sees the name and slogan
   instantly. The `# never-stale` H1 (kept for anchors/accessibility), the language
   switcher, and a one-line value prop follow.
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
| `assets/icon.svg` / `.png` | Logo — a refresh ring around three "rule" lines (top line orange = the language rule). 512×512 squircle. Its glyph is reused inside the banner and social-preview. | GitHub branding (no longer the README header — the banner replaced it). **Not** in the `/plugin` UI — the plugin/marketplace manifests have no icon field. |
| `assets/banner.svg` / `.png` | 1280×300 wide brand banner — logo glyph + `never-stale` wordmark + tagline (`Set once. Never drifts.`) on the dark background. Localized per language (`assets/i18n/<code>/banner.*`). | README header (top, above the fold), shown at width 880. |
| `assets/social-preview.svg` / `.png` | 1280×640 banner — bare glyph + `never-stale` wordmark + tagline on the dark background. | GitHub **Social preview** (must be uploaded manually under repo Settings — no API/CLI for it). |
| `assets/hero.png` (`hero.svg`) | Before/after still: rules drift vs. rules held, after an auto-compact. | README hero (above the fold). |
| `assets/flow.svg` / `.png` | Top-down timeline: enable → write rules → work → auto-compact → re-inject → keep working. The chronological "what happens" story. | README `How it works` section (lead visual; the technical mermaid sits in the details below it). |
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

## Internationalization (i18n)

The README is offered in five languages. **English `README.md` is canonical**; the
translations may lag and carry a note saying so, plus a translation-PR invitation.

- **Language codes** match the plugin's own v0.8.0 codes: `zh-Hant` (繁體中文),
  `zh-Hans` (简体中文), `ja` (日本語), `ko` (한국어).
- **Translated READMEs** are top-level files: `README.<code>.md`. Every README (English
  included) carries a language-switcher line near the top linking the other four; the
  current language is shown bold and unlinked.
- **Localized images.** Every text-bearing image is localized per language and lives in
  `assets/i18n/<code>/<name>.png` (with its `.svg` source beside it). The English
  images stay in `assets/`. A translated README points at `assets/i18n/<code>/…`.
  - **Localized (9):** `banner`, `hero`, `flow`, `commands`, `manage`, `demo`,
    `case1-language`, `case2-team`, `case3-monorepo`. (For `banner` the `never-stale`
    wordmark stays Latin; only the tagline line is translated.)
  - **Shared / not localized (2):** `icon` (no text) and `social-preview`
    (GitHub renders one preview per repo — it cannot be per-language, so it stays
    English).
- **Translation register.** Translations use standard written form for the broadest
  readership (e.g. `zh-Hant` is general Traditional Chinese, port/TW-readable), except
  where a line is *deliberately* in spoken register to make the scenario land (the
  "kept your language" demo/case lines stay in their colloquial HK form, since the
  point is showing the assistant talking like the user).

**Rendering localized images.** Same `sharp-cli` flow as the English images, but the
sources sit under `assets/i18n/<code>/` and the per-image pixel size must match the
English original (the SVG `viewBox` is unchanged — only the text nodes are translated).
CJK glyphs (繁中 · 简中 · 日本語 · 한국어, including Hangul) render correctly under
`sharp`/`resvg` via the system CJK fallback; a `'Noto Sans CJK'` family is added to the
`font-family` list as a hint but is not required. Per image:

```bash
cd assets/i18n/zh-Hant
mkdir _r
npx --yes sharp-cli@latest -i hero.svg -o _r -f png resize 760 318
mv -f _r/hero.png ./hero.png && rm -rf _r
```

Sizes: `banner` 1280×300 (the only non-760-wide asset) · `hero` 760×318 ·
`flow` 760×540 · `commands` 760×430 · `manage` 760×330 · `demo` 760×472 ·
`case1-language`/`case2-team` 760×412 · `case3-monorepo` 760×396.
Always inspect each render — CJK text is wider than the Latin monospace the layouts were
tuned for, so a translated line can overflow where the English one fit. (Korean is the
widest; the `ko` banner tagline drops to font-size 32 where the others use 34.)

## Slogans

Chosen, and where each is used:

- **Banner tagline:** `Set once. Never drifts.` (the README-top banner, all 5
  languages — wordmark stays `never-stale`, only the tagline is translated:
  `zh-Hant` 一次設定,永不走樣。 · `zh-Hans` 一次设定,永不偏移。 ·
  `ja` 一度決めれば、もう逸れない。 · `ko` 한 번 정하면, 다시 흔들리지 않는다.).
- **Social-preview tagline:** `Rules that survive auto-compact.` (the 1280×640 GitHub
  social card — a separate asset, English only).
- **README hero line:** `Set the rules once — they stay in front of Claude all session.`
- **README punch line:** `Keep CLAUDE.md in front of Claude.`
- **GitHub repo description (`og:description`):** `Set once. Never drifts. — Claude Code
  rules that survive auto-compact.` Kept short on purpose so social cards do not truncate
  it (the earlier long form did).

**Name vs slogan.** The plugin name stays **`never-stale`** (it is published at v0.8.0
with users, opted-in project markers `.claude/never-stale.json`, the `never-stale:`
CLAUDE.md sentinels and command namespace, and a full wordmarked asset set — renaming
would be a breaking rebrand for a marginal gain). The slogan deliberately uses a
*different* word — "drift" — because "drift" names the behavioral failure (the assistant
sliding off your rules after a compact) more sharply than "stale" (which fits the
doc-sync half). A name and slogan need not share a word; here the two words cover the two
halves of what the plugin does.

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
