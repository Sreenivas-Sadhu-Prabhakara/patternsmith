# patternsmith

A regex tool that speaks plain English in **both directions** — the whole point.

- **Explain (regex → English).** Paste any regex + flags and read it back token by
  token: anchors, literals, classes, quantifiers, groups & captures, alternation,
  backreferences, lookaround and flags, each labelled in plain words.
- **Build (intent → regex).** A palette of ready-made intents (email, URL, IPv4,
  ISO date, 24-hour time, phone, hex colour, slug, integer, decimal, UUID, …) plus
  composable building blocks (one-or-more digits, a word, optional, capture,
  anchor, …). Each addition is narrated, and the pattern flows into the tester.
- **Live tester.** Real-time match highlighting, a captured-groups table, match
  count, `g/i/m/s/u` flag toggles and a replace-with preview.
- **A compact cheatsheet** always on hand.

## Safety

All matching runs on a **Web Worker** with a wall-clock kill switch. A single
`RegExp.exec()` on a catastrophic pattern (e.g. `/(a+)+$/`) cannot be interrupted
from within its own thread — so the main thread terminates the worker if it blows
its time budget and shows a friendly *"too slow"* message. The page can never hang.
See `public/matcher.worker.js` and `src/lib/safematch.js`.

## Privacy

100% client-side. Native `RegExp` only. A strict Content-Security-Policy with
`connect-src 'none'` is enforced via a `<meta>` tag — nothing you type ever leaves
the device. State (pattern + flags + sample) lives in the URL hash, so you can
share a link without a server.

## Structure

```text
public/
  favicon.svg           forge / anvil mark
  matcher.worker.js     off-thread matcher (self-contained, no imports)
src/
  lib/
    explain.js          regex → ordered plain-English segments
    intents.js          ready-made intents + composable blocks
    flags.js            flag descriptions
    cheatsheet.js       reference data
    safematch.js        worker-backed, time-capped matching guard
  scripts/
    app.js              client wiring (bundled by Astro → script-src 'self')
  pages/
    index.astro         markup, styles, SEO, CSP
astro.config.mjs        site + base '/patternsmith' for GitHub Pages
```

## Commands

| Command           | Action                                        |
| :---------------- | :-------------------------------------------- |
| `npm install`     | Install dependencies                          |
| `npm run dev`     | Local dev server                              |
| `npm run build`   | Build the static site to `./dist/`            |
| `npm run preview` | Preview the production build locally          |

Deploys as a static site under `/patternsmith/` (GitHub Pages). Every asset and
link is referenced via `import.meta.env.BASE_URL` so nothing 404s under the base
path.
