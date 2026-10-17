# mobile-store-assets

A Claude Code plugin that generates **every iOS and Android marketing image** an app needs — App Store + Google Play screenshots, feature graphics, Wear OS, TV banner — from your raw app screenshots, and authors ASO copy as a **4-set A/B test matrix** ready for Apple PPO and Google Play store-listing experiments.

**Backgrounds default to AI** (Imagen 4 or `gpt-image-1`) when an `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` is present in `marketing/.env.local` (or in `~/.config/mobile-store-assets/.env`, shared by all your projects) — the prompt is steered by your `app.category`, `aso.positioning`, `aso.primary_keywords`, and `spec.hint` so every set carries on-brand subject motifs. **Fallback is CSS / SVG** composition with Sharp: deterministic, instant, free — used automatically when no key is set, or via `--css-bg`. Eight unique backgrounds power the entire matrix (4 themes × 2 orientations).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Status: stable](https://img.shields.io/badge/status-stable-success)

---

## Install

Two commands from inside Claude Code:

```bash
/plugin marketplace add dbroadhurst/mobile-store-assets
/plugin install mobile-store-assets@dbroadhurst
```

That registers the GitHub repo as a marketplace and installs the plugin from it. Both `/plugin marketplace update dbroadhurst` and `/reload-plugins` pick up future changes.

---

## Skills (six)

| Skill | Role |
|-------|------|
| **`/store-init`**     | Bootstrap a project — creates `marketing/` layout, starter spec, `.gitignore` entries, screenshot folders for every default platform |
| **`/store-spec`**     | Author / refine `spec.yaml` — orchestrator that consults `aso-toolkit` for content frameworks and the platform skills for field rules |
| **`/store-assets`**   | Render the matrix — 4 sets × every platform × every locale, with a self-contained review.html auto-emitted |
| `aso-toolkit`         | ASO frameworks: keyword research, metadata optimisation (3 variants per field), competitor analysis, audit scorecard |
| `ios-store-requirements` | App Store Connect specs + policy reference (current required sizes, indexing weights, PPO, CPPs, App Preview) |
| `android-store-requirements` | Google Play specs + policy reference (screenshot specs, NLP indexing, store-listing experiments, CSLs, banned words) |

---

## Quick start

```bash
# 1. Bootstrap a fresh project
/store-init 1.0.0 --app-name "Coin" --bundle-id "com.example.coin" --category Finance

# 2. Drop screenshots into marketing/releases/1.0.0/screenshots/{platform}/
#    Place an icon at the path in marketing/.store-config.yaml

# 3. Author the ASO copy + 4-set A/B test matrix
/store-spec 1.0.0

# 4. Render every iOS + Android asset
/store-assets 1.0.0

# 5. Open marketing/releases/1.0.0/review.html to vote/comment per image
```

That's the full loop. Re-runs are cheap: the AI cache reuses backgrounds, layouts re-render in milliseconds.

---

## What you get out of the box

### Default-enabled platforms (current store-required)

| Platform | Resolution | Output folder |
|----------|------------|---------------|
| iPhone 6.9" | 1320 × 2868 | `app-store/iphone-6.9/` |
| iPad Pro 13" (M4) | 2064 × 2752 | `app-store/ipad-pro-13/` |
| iPad Pro 12.9" (legacy default) | 2048 × 2732 | `app-store/ipad-pro-12.9/` |
| Android phone | 1440 × 2880 | `google-play/phone/` |
| Android 10" tablet | 1600 × 2560 | `google-play/tablet/` |
| Google Play feature graphic | 1024 × 500 | `google-play/feature-graphic.png` |

### Opt-in platforms (`--include-<key>` or `--include-all`)

| Platform | Resolution | Flag |
|----------|------------|------|
| iPhone 6.7" | 1290 × 2796 | `--include-6.7` |
| iPhone 6.5" | 1242 × 2688 | `--include-6.5` |
| Android 7" tablet | 1200 × 1920 | `--include-7-tablet` |
| Wear OS | 384 × 384 | `--include-wear` |
| Android TV banner | 1280 × 720 | `--include-tv-banner` |

Plus `store-listing.md` files (paste-ready copy for both consoles) and an inline-manifested `review.html` that loads via `file://` (no server needed).

---

## Eight visual layouts (rotate via the matrix)

| Slot | Portrait layouts | Landscape layouts |
|------|------------------|-------------------|
| Value | `uppercase-top`, `logo-tilted`, `highlight-pill`, `caption-below` | `landscape-hero`, `landscape-split` |
| Usage | `caption-below`, `card-tilted`, `dual-phone-overlap`, `side-list` | `landscape-split`, `landscape-hero` |
| Trust | `side-list`, `dual-phone-overlap`, `caption-below`, `highlight-pill` | `landscape-split`, `landscape-hero` |
| CTA   | `text-hero` (no phone) | `landscape-text-only` |

Each set picks one layout per slot. Set A might be `uppercase-top → caption-below → side-list → text-hero`; Set B rotates to the next valid choice in each slot. Story-arc preserved within every set.

The screenshot is the source of truth for the device frame's aspect — iPad sources render iPad-shaped, iPhone sources iPhone-shaped, landscape sources render landscape, with no clipping or stretching.

---

## CLI flags

```bash
# Sets
/store-assets 1.0.0 --sets 4               # default ABCD
/store-assets 1.0.0 --sets 8               # ABCDEFGH
/store-assets 1.0.0 --sets A,C             # specific sets
/store-assets 1.0.0 --sets 1               # legacy single-set mode (no set-X/ folders)

# Locales — each gets its own folder under output/
/store-spec   1.0.0 --locales en-US,fr-FR,de-DE
/store-assets 1.0.0 --locales en-US,fr-FR,de-DE

# Backgrounds — AI is default when keys are present, else CSS
/store-assets 1.0.0 --use-ai-bg            # force AI even without auto-detect
/store-assets 1.0.0 --css-bg               # force CSS even when keys exist
/store-assets 1.0.0 --provider openai      # pick provider when both keys present
/store-assets 1.0.0 --regen home           # bypass AI cache for one screenshot
/store-assets 1.0.0 --regen all            # bypass entirely

# Theme + extras
/store-spec 1.0.0 --theme-from-screenshot marketing/releases/1.0.0/screenshots/ios-phone/01-home.png

# Iterate cheaply
/store-assets 1.0.0 --dry-run              # CSS path, no API calls

# Maximal asset bundle (every legacy / opt-in platform)
/store-assets 1.0.0 --include-all
```

---

## Output structure

```
marketing/releases/{version}/
  manifest.json                  ← lists every render with set/screenshot/platform/layout/slot
  review.html                    ← inline-manifested vote/comment page
  output/
    set-A/
      app-store/{iphone-6.9,ipad-pro-13,...}/
      google-play/{phone,tablet,feature-graphic.png,...}
      {google-play,app-store}/store-listing.md
    set-B/  set-C/  set-D/
```

With locales: `output/{locale}/set-X/...`. With `--sets 1` the `set-X/` segment collapses.

---

## Honesty rule (hard line)

Every claim across every field must be verifiable from explicit evidence in the spec, config, or user-provided context. Default to omission. The skill will refuse to generate fake review counts, "1M+ users", "trusted by", awards, or "No Ads" claims that aren't grounded in real app facts. The canonical anti-pattern: never include "No Ads" unless the user has explicitly stated their app runs ad-free — most free apps don't.

See `aso-toolkit` §2 and `store-spec` for the verification table.

---

## How the matrix saves API cost

Without this plugin, generating 80 store images with AI = ~80 API calls.

With the plugin's bucket cache, **the entire matrix uses 8 unique backgrounds** (4 themes × 2 orientations — portrait + landscape). Each platform canvas pulls from the right bucket and CSS `background-size: cover` does the centre cropping inside the JSX layout. Exactly 8 calls, regardless of how many sets × screenshots × platforms you render.

A typical 4-set × 5-screenshot × 4-platform run on `gpt-image-1`:
- Without bucketing: ~80 calls × $0.04 = **$3.20**
- With bucketing: 8 calls × $0.04 = **$0.32**

The disk cache (`marketing/.cache/backgrounds/`) keeps reuse across runs.

---

## Companion tooling

The `aso-toolkit` skill captures content-generation frameworks adapted for the spec workflow. For deeper ASO work — keyword volume / difficulty data, competitor metadata snapshots, ranking history — connect a live data source via MCP:

- **[Eronred / aso-skills](https://github.com/Eronred/aso-skills)** — MIT-licensed companion with 14 skills covering UA campaigns, retention, monetisation, app-launch beyond text generation
- **[Appeeky MCP](https://docs.appeeky.com/docs/mcp)** — live App Store data feed used by the Eronred toolkit; works with this plugin's `aso-toolkit` for upgraded keyword and competitor analysis

The Eronred toolkit and Appeeky are both optional — the plugin works standalone.

---

## Project structure

```
mobile-store-assets/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── bin/store-assets-gen          ← bash launcher
├── skills/                       ← six SKILL.md files
│   ├── store-init/
│   ├── store-spec/
│   ├── store-assets/
│   ├── aso-toolkit/
│   ├── ios-store-requirements/
│   └── android-store-requirements/
├── src/                          ← TypeScript renderer (Playwright + JSX + Tailwind)
│   ├── index.ts                  ← CLI entry + dispatcher
│   ├── render/                   ← Playwright headless-Chromium harness
│   │   ├── browser.ts            ← singleton browser instance
│   │   ├── html-shell.tsx        ← document shell (inlines Tailwind + fonts)
│   │   └── capture.ts            ← JSX → screenshot + DOM zone harvesting
│   ├── layouts/                  ← 14 JSX layout templates (one per surface)
│   │   ├── shared.tsx            ← data-URI + bracket-highlight helpers
│   │   ├── caption-band.tsx, hero-type.tsx, headline-masthead.tsx, …
│   │   └── feature-graphic.tsx   ← 3-variant Google Play banner
│   ├── helpers.ts                ← screenshotAspect + stripBrackets
│   ├── contrast-gate.ts          ← WCAG pixel-sampling readability audit
│   ├── backgrounds.ts            ← 5 CSS/SVG bg styles (fed into layouts as data URIs)
│   ├── themes.ts                 ← palette derivation + adaptive text colour
│   ├── colors.ts                 ← WCAG luminance + contrast helpers
│   ├── matrix.ts                 ← ABCD planner
│   ├── story-arc.ts              ← slot → valid layouts table
│   ├── review.ts                 ← manifest + review.html emission
│   ├── listing.ts                ← store-listing.md
│   ├── gemini.ts                 ← AI provider adapters
│   ├── cache.ts                  ← disk cache for AI backgrounds
│   └── retry.ts                  ← exponential backoff
├── templates/
│   ├── tailwind-input.css        ← Tailwind v4 source + design tokens
│   ├── tailwind.css              ← compiled bundle (built by `npm run build:css`)
│   ├── .store-config.yaml
│   ├── .env.local.example
│   ├── spec-starter.yaml
│   └── review.html
└── design/
    ├── build-preview.ts          ← regenerate the WYSIWYG layout atlas
    ├── index.html                ← browsable preview of every layout
    └── preview/*.png             ← committed renders, one per layout
```

### Dependencies

- **`playwright`** + bundled Chromium — the rendering engine. Installed on first run via `npx playwright install chromium`.
- **`react` / `react-dom`** — server-only via `renderToStaticMarkup`. No client runtime.
- **`tailwindcss` v4** — compiled to `templates/tailwind.css` at build time.
- **`sharp`** — synthetic background SVGs, image dimension reads, contrast-gate pixel sampling.
- **`@google/genai`** + **`openai`** — AI background providers.

---

## Development

```bash
git clone https://github.com/dbroadhurst/mobile-store-assets.git
cd mobile-store-assets
npm install
npx playwright install chromium   # one-time, ~90MB
npm run build:css                 # compile Tailwind bundle
npm run typecheck                 # type-check
./bin/store-assets-gen --version 1.0.0 --root /path/to/test-project

# Regenerate the design atlas after editing any layout:
npx tsx design/build-preview.ts
open design/index.html
```

Pull requests welcome. Open an issue first for anything substantial.

---

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 David Broadhurst.
