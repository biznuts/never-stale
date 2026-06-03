# Recording a real demo GIF

The README's hero is a before/after still (`assets/hero.png`); the
`How it works` section also carries `assets/demo.png` (rendered from the editable
`assets/demo.svg` source), a hand-drawn illustration of the experience. Both are
stills — a short **real** recording is far more convincing. Here is a tight script
that shows the value in under 20 seconds.

## What the clip must show

The whole point of never-stale is the *two moments of drift*. A good demo captures at
least one of them on screen:

1. **After auto-compact** — the `[never-stale]` reminder appears, and the assistant
   keeps the language/rules it might otherwise have dropped.
2. **After an edit** — the doc-sync reminder appears, and the assistant updates the
   related doc instead of forgetting.

Showing #1 is the money shot, because "forgetting after compaction" is the pain users
feel most.

## Setup (a clean stage)

1. In a throwaway project, run `/never-stale` and set a **non-English** spoken language
   (e.g. Traditional Chinese). The contrast makes "it kept the language" obvious.
2. Make the terminal window narrow-ish (~90 cols) and increase the font size so text is
   legible at GIF resolution.
3. Use a clean color theme; hide unrelated plugins/hooks if their output is noisy.

## The take

1. Start a session and do a little real work so the transcript looks lived-in.
2. Trigger a compaction. Either let a long session auto-compact, or force it (e.g.
   `/compact`), so the `SessionStart`/`compact` hook fires.
3. Capture the moment the `[never-stale]` reminder is injected, then the assistant's
   next reply **in the chosen language**.
4. (Optional second beat) Ask it to change a file, let the `PostToolUse` reminder fire,
   and show it updating the README.

## Recording tools

- **macOS / Windows / Linux:** [asciinema](https://asciinema.org/) →
  [agg](https://github.com/asciinema/agg) to convert the cast to a GIF. Crisp text,
  small files.
- **Screen capture:** [Kap](https://getkap.co/) (macOS),
  [ScreenToGif](https://www.screentogif.com/) (Windows),
  [Peek](https://github.com/phw/peek) (Linux).
- Keep it **≤ 6 MB** so it loads fast in the README; trim dead air, target ~15–25 s.

## Wiring it into the README

1. Save the GIF as `assets/demo.gif`.
2. In `README.md`, swap the `<img src="assets/demo.png" …>` for
   `<img src="assets/demo.gif" …>` (keep the `width` and a descriptive `alt`).
3. Keep `assets/demo.png` (and its `assets/demo.svg` source) as a fallback, or delete
   them once the GIF lands.

A GitHub-hosted GIF autoplays in the rendered README, so no click-to-play is needed.
