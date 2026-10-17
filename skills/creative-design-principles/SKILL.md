---
name: creative-design-principles
description: >
  Evidence-based visual rules for App Store and Google Play screenshots,
  feature graphics, and other store imagery. Covers composition, colour,
  contrast, and text readability — grounded in WCAG 2.2 web standards and
  recent ASO conversion data. Consult this skill whenever authoring or
  rendering store assets (used by /store-spec and /store-assets) so every
  layout, palette, and caption clears a minimum readability bar before it
  reaches a real store listing.
---

# Creative Design Principles — Store Page Imagery

This skill is the **design brain**: how a store screenshot or feature
graphic must *look* to convert. The other skills handle adjacent concerns:

- `aso-toolkit` — what the copy says
- `ios-store-requirements` / `android-store-requirements` — pixel sizes, policy limits
- `store-assets` — rendering pipeline that enforces these rules at output time

Every rule below is paired with the data that justifies it. When two
guidelines conflict, prefer the one with the strongest measured CTR /
conversion impact.

---

## TL;DR — the eight rules that move the needle

1. **First three slots are 90% of the decision.** Treat slots 1–3 as one
   composition (Value → Flow → Trust). Most visitors never see slot 4.
2. **Captions must pass the 25%-zoom test.** If you cannot read the headline
   on a thumbnail, it is not doing any work. Minimum 56–72 pt headline at
   1290 × 2796 px source.
3. **Hit WCAG 2.2 AA contrast at minimum: 4.5:1 for body text, 3:1 for
   large text (≥ 18 pt / 14 pt bold) and graphical UI.** Aim for AAA
   (7:1) on any caption a user scans for less than a second.
4. **Never put white text on a mid-luminance background.** Pick text colour
   from background luminance, not from brand guidelines.
5. **Lock the palette across all 10 screenshots.** Consistent colour
   raises brand recognition by ~80% and retention by ~23%
   ([Color Research & Application]).
6. **One idea per screenshot, ≤ 5–7 words per headline.** Users scan, they
   do not read.
7. **Show a person or a face wherever the app's value involves a human
   outcome.** Faces are the strongest eye anchor and lift engagement in
   neuromarketing tests.
8. **Test slot 1 first, then slot 2, then the icon.** Highest leverage
   creative tests in that order.

---

## Why this matters — the conversion data

Numbers below are reproducible benchmarks from ASO tooling vendors and
public case studies. Treat them as ranges, not guarantees.

| Lever | Reported lift | Source |
|-------|--------------|--------|
| Optimised screenshots vs. raw app screens | **+20% to +35%** install rate | AppTweak / SplitMetrics 2024–25 benchmarks |
| Average winning screenshot A/B test | **+10% to +25%** conversion | Sensor Tower, ASOMobile 2025 |
| Icon A/B winners (Google Play) | median **+8% to +12%** CVR (top decile **+28%**) | SplitMetrics |
| Custom Product Pages (iOS PPO) | up to **+8.6%** | Apple, Adapty 2026 benchmarks |
| High-contrast text vs. low-contrast | **~89%** improvement in readability scores | Industry readability studies cited by Moburst, AppScreenshotStudio |
| Consistent palette across creatives | **+80%** brand recognition, **+23%** retention | Color Research & Application |
| Visitors who never scroll past slot 3 | **~90%** | StoreMaven, SplitMetrics |

Two structural truths underneath those numbers:

- **iOS search results display the first three portrait screenshots (or
  one landscape) inline.** A meaningful share of impressions never reach
  the product page at all.
- **Thumbnail display is the dominant viewing condition.** Captions,
  device frames, and accent colours are judged at ~25% of their authored
  size before anything else.

---

## 1. Composition & visual hierarchy

### 1.1 Story arc across slots

Map slot → job. The renderer's `story-arc.ts` encodes this; visual
reference for every layout is in `design/layouts-phone-portrait-shots.html`
(plus the three sibling files for phone-landscape / tablet-portrait /
tablet-landscape).

| Slot | Job | Caption framing | Layout family (portrait) |
|------|-----|-----------------|------------------|
| 1 | **Value** — what is this | Benefit headline (not feature) | `hero-type`, `headline-masthead` |
| 2 | **Flow** — how it works | Verb-led ("Track in seconds") | `caption-band`, `editorial-card` |
| 3 | **Trust** — why believe you | Proof / reassurance | `feature-stack`, `vertical-bento` (stat tiles) |
| 4+ | Features / depth | One feature per screen | `tilted-card`, `dual-phone`, `editorial-card`, `vertical-bento` |
| Final | CTA | "Get started free" | `hero-type` (CTA variant) |

Recommended 10-slot sequence for the default ABCD matrix:
`hero-type → caption-band → feature-stack → editorial-card → vertical-bento
→ dual-phone → tilted-card → caption-band → feature-stack → hero-type(CTA)`.

**Older / superseded layout names** (`text-hero`, `caption-below`, `uppercase-top`,
`logo-tilted`, `aurora-hero`, `bento`, `editorial-split`, `highlight-pill`,
`side-list`, `card-tilted`, `dual-phone-overlap`) are automatically
remapped to the canonical names above by `LEGACY_LAYOUT_ALIASES` in
`src/index.ts`. Existing spec.yaml files keep working without edits.

### 1.2 Scanning patterns

Users scan left-to-right, top-to-bottom, with these anchors in order of
attention: **faces → bright accent colour → text → UI**. Place the
single most important word inside the top-left third of the canvas.

### 1.3 One idea per screenshot

If a headline needs a comma or an "and", it is two screenshots. Cap at
5–7 words. The renderer's `text-fit` step will shrink overflowing copy,
but shrunk copy fails the thumbnail test.

### 1.4 Negative space

Reserve at least **15–20% padding** from each edge for portrait phone
canvases. Crowded edges read as chaos at thumbnail size.

---

## 2. Colour

### 2.1 Contrast targets (WCAG 2.2)

These web standards apply directly to store creatives because users read
them on the same displays. The repo's `src/colors.ts` already implements
WCAG 2.x relative luminance and contrast ratio.

| Where | Element | WCAG | Minimum | Recommended |
|-------|---------|------|---------|-------------|
| Caption body / subhead | Normal text < 18 pt (< 14 pt bold) | 1.4.3 (AA) | **4.5 : 1** | 7 : 1 (AAA) |
| Headline / pull-quote | Large text ≥ 18 pt (≥ 14 pt bold) | 1.4.3 (AA) | **3 : 1** | 4.5 : 1 (AAA) |
| Accent shapes, pills, buttons | Non-text graphic | 1.4.11 | **3 : 1** | 4.5 : 1 |
| Logo / decorative | Inactive UI | n/a | exempt | – |

`pickTextColor()` in `src/colors.ts` already picks the higher-contrast
choice between white and a soft black `#1A1A1A`. The soft black is
deliberate: pure `#000` against pure `#FFF` is **21 : 1** but causes halation
on bright displays — WCAG-compliant *and* slightly less fatiguing.

`ensureAccentContrast()` boosts an accent until it clears 4.5 : 1 against
the gradient midpoint. Use it for **any text-bearing accent** — pills,
chip labels, badge numbers.

### 2.2 The mid-luminance trap

The single most common failure: **white text on a mid-luminance
background** (light teal, lavender, beige, mid-gradient pinks). The
contrast crashes into the 2 : 1–3 : 1 range and the type vanishes at
thumbnail size.

Rule: derive text colour from *background luminance at the text's
position*, not from the brand. For gradient backgrounds, sample the
midpoint (`averageHex` in `src/colors.ts`).

### 2.3 Palette consistency

- Use the **same primary + secondary** across all 10 screenshots in a
  set. The renderer already extracts these from one source screenshot via
  `extractTheme()`.
- Limit accents to **one warm + one cool** per set; rotate by slot, never
  per element.
- Background gradients should share a hue family per set (e.g. all four
  sets in an ABCD matrix differ from each other, but inside any one set
  the slots stay coherent).

### 2.4 Colour psychology by category

These mappings are heuristics from neuromarketing reviews — they bias
where to *start*, not where to *land*. Always A/B test.

| Category | Lean toward | Avoid |
|----------|-------------|-------|
| Finance, health, productivity | Blue, deep green, navy (trust) | Red dominance (loss aversion) |
| Games, social, dating | Magenta, orange, vivid gradients | Greyscale (reads as utility) |
| Wellness, meditation | Soft greens, lavender, off-white | Saturated red, neon |
| Commerce, deals, food | Orange, red, amber (urgency, appetite) | Pale blue (cold) |
| Children / education | High-chroma primaries | Murky earth tones |

Saturation note: **+10–15% saturation** above the in-app brand colour
typically renders better in thumbnails because the screen-vs-store
luminance gap eats vibrance. The renderer's `saturate()` helper handles
this.

---

## 3. Typography & text readability

### 3.1 Minimum sizes (source-resolution targets)

Sizes below are for the **6.9" iPhone source** (1290 × 2796). Scale
proportionally to the canvas's *shorter* side for other dimensions —
landscape canvases use their height, not width.

Floors are derived from WCAG body-text conventions translated to the
source-canvas resolution. A 1290-px source renders on a ≈ 430 logical-pt
phone display at 3× retina, so **1 CSS px ≈ 3 source px**. The web body
minimum of 16 CSS px maps to a **48 source-px floor** for any text the
user has to read (subhead, caption, body). Larger UI ink (badges, stat
labels) sits one tier below at 14 CSS px / 42 source px — the Apple HIG
Callout / Material body2 floor. Anything smaller is unreadable both at
native phone scale and at thumbnail.

| Role | Minimum (source px @ 1290) | CSS-px equivalent | Typical | Notes |
|------|---------------------------:|------------------:|---------|-------|
| Hero headline                 | **80 px** | ≈ 27 CSS px (> WCAG large-text 24) | 96–120 px | One line, max 5–7 words |
| Subhead                       | **48 px** | = 16 CSS px (WCAG body)            | 56–72 px  | One line, max ~10 words |
| Caption / body                | **48 px** | = 16 CSS px (WCAG body)            | 56–64 px  | Avoid wrapping > 2 lines |
| UI labels inside device frame | **42 px** | ≈ 14 CSS px (HIG Callout / md body2)| 48–56 px | Only if narratively necessary |
| Badges / stat captions        | **42 px** | ≈ 14 CSS px                        | 48–56 px  | Pair with high-contrast chip |

Universal absolute floor: **42 source px** (= 14 CSS px). Any text
smaller than this is unreadable on App Store / Play Store screenshots at
native size and unreadable at thumbnail. Enforced by
`src/contrast-gate.ts` — failures surface in `manifest.json` and
`review.html`.

### 3.2 The 25% zoom test

Render the screenshot, scale to 25% (≈ the thumbnail size shown in
search), and read every text element at arm's length. If anything is
illegible, increase its size or remove it. This single test eliminates
~80% of low-converting creatives in practice.

### 3.3 Casing, weight, and spacing

- **Sentence case** for body and most captions — proven 5–10% faster to
  parse than all-caps in eye-tracking studies.
- **ALL-CAPS only** for short labels (≤ 3 words) and only with **+5% to
  +10% letter spacing** to restore the lost word-shape cue.
- **Weight ≥ 600** for any headline on a textured / photographic
  background. Light weights (≤ 400) fail under any background noise.
- **Line-height 1.1–1.2** for headlines, **1.35–1.5** for body. Tight
  headlines, generous body.
- **Avoid italics for body** — slower to read; reserve for emphasis on
  ≤ 1–2 words.

### 3.4 Font choice

- Default to a **geometric or humanist sans-serif** with at least 5
  weights (e.g. Inter, SF Pro, Plus Jakarta, Manrope, Outfit). Variable
  fonts are ideal for tight optical scaling across canvas sizes.
- **One typeface family per set.** A display face is OK for the hero
  headline only if it has a body-weight companion.
- **Never use the system serif on a screenshot.** Serif details disappear
  at thumbnail size on most phone screens.

### 3.5 Text spacing (WCAG 1.4.12)

Adopt the WCAG text-spacing minimums even though they were written for
the web — they make rendered captions resilient to localisation:

- Line height ≥ 1.5× font size for paragraphs
- Letter spacing ≥ 0.12× for ALL-CAPS, 0× for sentence case
- Word spacing ≥ 0.16× of font size
- Paragraph spacing ≥ 2× font size

### 3.6 Localisation safety margin

Reserve **+30% horizontal room** for languages that expand from English
(German, Finnish, Russian). The `text-fit` rule should shrink rather
than wrap when the expansion exceeds the canvas; never let a German
headline drop to two lines while the English version stays on one — the
layout reads as broken.

---

## 4. Background, depth, and lighting

### 4.1 Background categories

| Style | When it works | Risk |
|-------|---------------|------|
| **Solid brand colour** | Utility apps, fintech, productivity | Boring at scale; avoid for slot 1 |
| **Linear gradient** | 90% of high-converting modern apps | Mid-luminance trap (§2.2) |
| **Radial / spotlight** | Hero shots, single subject | Focal point must align with caption |
| **Photo / lifestyle** | Categories where context sells (travel, fitness, food) | Text contrast collapses unless a scrim is used |
| **Pattern / motif** | Games, kids, creative tools | Easy to over-clutter; mute to 10–15% opacity behind text |

### 4.2 Text scrims

If the background behind text varies in luminance (any gradient, photo,
or pattern), drop a **scrim** behind the text: a soft gradient overlay
sized to the text bounding box, opacity 30–60%, colour chosen to push
the local luminance to the safe end for the text colour.

The renderer's feature-graphic pipeline already uses a scrim — extend
the same pattern to any layout that picks a photographic background.

### 4.3 Device frame contrast

The device frame itself needs **≥ 3 : 1** against the background or it
disappears at thumbnail size. For very dark backgrounds, switch to a
silver frame; for very light, a graphite frame. The renderer's frame
module should pick this automatically.

### 4.4 Drop shadows and depth

- Single soft shadow, blur radius ~ 6% of canvas height, opacity 15–25%
- Never stack multiple shadows on the device — it stops reading as a
  phone and starts reading as a sticker
- Inside the device screen, no shadow at all — the captured screenshot
  already carries depth cues

---

## 5. Imagery — devices, hands, people

### 5.1 Device frames

- **Frame must match the platform.** iPhone frame on App Store, Android
  frame on Google Play — never cross-frame (AppPresser, 2025). Cross-frame
  shots erode trust ("they didn't bother to make a real Android app").
- One device per shot for slots 1–3 unless the app's value is explicitly
  multi-device (Wear OS, iPad + iPhone, TV)
- Tilt at **0°** for trust/value slots and **±8° to ±12°** for energy /
  flow slots — anything past 15° starts to feel chaotic at thumbnail
- Crop **never** cuts the device frame at the headline edge — the eye
  reads it as broken

### 5.2 Hands and people

- Hands holding the device add **measurable lift** (5–15% in published
  case studies) for consumer apps; avoid for B2B / dev tools where it
  reads as condescending
- Faces increase fixation time **2–3×** (eye-tracking literature).
  Use a face when the app's promise is emotional (dating, social,
  wellness, kids); skip it when the promise is functional (file
  manager, password vault)
- Skin-tone diversity matters for global stores — match the locale's
  store front when possible

### 5.3 Glyphs, icons, and decorative shapes

- Subordinate to the device — never larger than 25% of canvas height
- One accent shape per slot
- Avoid emojis as decoration; they age badly and break locale neutrality

---

## 6. Process — testing and validation

### 6.1 The order of A/B tests (highest leverage first)

1. **Slot 1 (caption + background)** — biggest single conversion lever
2. **App icon** — second-biggest, but reset rule: never test icon and
   slot-1 in the same window
3. **Slot 2 caption framing** — benefit vs. feature vs. emotional
4. **Screenshot order (slot 2 ↔ slot 3)** — usually 5–10% delta
5. **Background style** (gradient vs. solid vs. photo)
6. **Colour scheme** (warm vs. cool, dark vs. light)
7. **Long-tail slots (5–10)** — diminishing returns

### 6.2 Statistical hygiene

- Run each test for at least **7 days** to absorb day-of-week effects
- Minimum **~5,000 impressions per variant** for stable CVR signal at
  category-typical baselines
- One variable per test — caption + background changed together teaches
  you nothing about either

### 6.3 Automated checks before publishing

The renderer should refuse to ship any image that fails these
machine-checkable gates:

| Gate | Threshold | Source helper |
|------|-----------|---------------|
| Text-vs-bg contrast (each text layer) | ≥ 4.5 : 1 normal, ≥ 3 : 1 large | `contrastRatio()` |
| Accent-vs-bg contrast (text-bearing) | ≥ 4.5 : 1 | `ensureAccentContrast()` |
| Device-frame-vs-bg contrast | ≥ 3 : 1 | – (add to renderer) |
| Headline character count | ≤ 38 chars (≈ 5–7 words) | `text-fit` |
| Headline after shrink | font size ≥ 80 source px at 6.9" (≈ 27 CSS px) | `text-fit` |
| Any text after shrink | font size ≥ 42 source px at 6.9" (≈ 14 CSS px) | `contrast-gate.ts` |
| Bounding-box hits canvas edge | ≥ 15% padding | layout module |

Any failed gate is a build-time warning, not a silent override.

---

## 7. Common failure modes (anti-patterns)

- **White text on a mid-tone gradient** — fails 4.5:1, vanishes at
  thumbnail
- **All-caps body copy** — slower to read, reads as shouty
- **Three taglines crammed into one shot** — none of them lands
- **Pure black `#000` text on pure white `#FFF`** — passes contrast,
  fails comfort; use `#1A1A1A` on `#FAFAFA`
- **Per-slot palette changes** — destroys brand recognition
- **Device frame swallowed by background** — < 3 : 1 contrast
- **Headlines that mention the company name** — wastes the only six
  words the user reads
- **Stock-photo backgrounds with text laid directly on the photo** —
  always add a scrim
- **Decorative emoji as substitute for design** — looks dated within
  a quarter
- **Different fonts per slot** — looks unfinished

---

## 8. How the code enforces this

| Rule | Code | Notes |
|------|------|-------|
| WCAG luminance / contrast ratio | `src/colors.ts` `relativeLuminance`, `contrastRatio` | WCAG 2.x formula |
| Adaptive text colour | `src/colors.ts` `pickTextColor`, `pickTextColorsForGradient` | Soft black `#1A1A1A` over pure black |
| Accent contrast boost | `src/colors.ts` `ensureAccentContrast` | Adjusts L until ≥ 4.5 : 1 |
| Palette extraction | `src/colors.ts` `extractTheme` | Saturation-weighted dominant colour |
| Saturation / hue tweaks | `src/colors.ts` `saturate`, `shiftHue`, `lighten` | Use sparingly per §2.3 |
| Layout / slot story arc | `src/story-arc.ts` | Slot → valid layout family |
| Matrix / palette per set | `src/matrix.ts`, `src/themes.ts` | Eight backgrounds across ABCD |
| Text fit / wrap | CSS — `text-wrap: balance` + `clamp()` font sizing in each JSX layout | No manual char-budget math; browser handles wrapping |
| Glassy text panels | CSS `backdrop-filter: blur() saturate()` in each JSX layout | Replaces the prior pixel-sampled solve-alpha pass |
| Auto-remediation retry loop | `src/index.ts:renderLayoutWithRetry` | Bumps `--scrim-boost` CSS var 0.15 → 0.30 over 2 retries when WCAG fails |
| Contrast gate | `src/contrast-gate.ts:validateZones` | Samples rendered pixels under each `[data-zone]` bbox, compares to declared text colour |
| Font-size floor | `src/contrast-gate.ts:minFontPxFor` | Per-role minimums scaled to canvas's shorter side |
| Layout dispatcher | `src/index.ts:renderLayout` | Maps `screenshot.layout` → JSX template; legacy spec names auto-route via `LEGACY_LAYOUT_ALIASES` |

When this skill conflicts with what the code currently does, fix the
code — these rules carry the conversion data; the renderer is the
mechanism.

---

## 10. Readability strategy

The principle: **headline + subhead text needs predictable contrast against
the background**, regardless of whether the background is an AI image, a
gradient, or a phone screenshot bleeding behind a panel. Backgrounds —
especially AI-generated ones — cannot be trusted to honour a text-safe
zone on their own.

### 10.1 The three text-container styles

| Style | Use | Default opacity | CSS pattern |
|-------|-----|-----------------|-------------|
| Glassy panel | Hero headlines, value slot, masthead | 0.55 – 0.78 | `rgba(10,15,31,X)` + `backdrop-filter: blur(20px) saturate(160%)` |
| Soft band | Captions, banners, full-width strips | 0.30 → 0.50 (gradient) | Linear-gradient with feathered top edge + backdrop-filter |
| Chip | Badges, feature claims, eyebrow tags | Near-opaque | Solid pill, brand or accent fill |

The blur does most of the contrast work — it smears whatever's behind the
panel into a uniform mid-tone, so the same opacity setting reads cleanly
over dark gradients, light phone screenshots, and busy AI backgrounds.

### 10.2 Auto-remediation loop

Every layout's `[data-zone]` text elements are audited after render: the
gate samples rendered pixels under each zone and compares to the declared
text colour. On WCAG failure, `renderLayoutWithRetry` bumps the
`--scrim-boost` CSS variable (0.15 → 0.30 over 2 retries) and re-renders.
Layout panels add this directly to their `rgba(…)` alpha, so each retry
produces a darker panel without regenerating any layout code.

### 10.3 Safe-area enforcement (CSS-native)

Layouts use `text-wrap: balance` and `clamp(min, fluid, max)` font sizes
in container-query units (`cqh`/`cqw`). The browser handles wrapping and
line balancing; there's no manual character-budget table to maintain.
The font-size floor in `contrast-gate.ts:minFontPxFor` enforces a minimum
that scales with the canvas's shorter side, so very long copy on a small
canvas can't shrink past the WCAG-derived threshold.

### 10.4 Reference

Open `design/index.html` in a browser for the WYSIWYG layout atlas —
every shipping layout rendered at a representative canvas size with
stock content. Regenerate after layout edits with:

```bash
npx tsx design/build-preview.ts
```

For routine spec-authoring decisions (which layout for which slot, what
data each layout consumes) — consult §11 below.

---

## 11. Layout atlas — the canonical 13-layout vocabulary

This is the canonical reference. **Don't open `design/index.html` for
routine decisions** — every layout's slot job and composition intent is
captured here. The atlas is for visual QA after edits, not for spec
authoring.

### 11.0 Files at a glance

| File | Role |
|------|------|
| `src/layouts/<name>.tsx` | The shipping layout — JSX template, Tailwind tokens, container-query units |
| `src/layouts/shared.tsx` | Data-URI helpers + bracket-highlight + `cssAspectRatio` |
| `design/index.html` | Browsable atlas of every layout at a representative canvas size |
| `design/build-preview.ts` | Regenerates the atlas after layout edits |

### 11.1 The fundamental rule

> **Source-screenshot orientation drives everything.**
> Portrait source → portrait canvas + portrait device + portrait content.
> Landscape source → landscape canvas + landscape device + landscape content.
> No rotation, no letterboxing. The plugin picks the matching layout file
> based on what orientation the developer's app screens were captured in.

Four parallel layout files map 1:1 onto this rule:

| Source orientation | Device class | File |
|--------------------|--------------|------|
| Portrait | Phone | `design/layouts-phone-portrait-shots.html` |
| Landscape | Phone | `design/layouts-phone-landscape-shots.html` |
| Portrait | Tablet | `design/layouts-tablet-portrait-shots.html` |
| Landscape | Tablet | `design/layouts-tablet-landscape-shots.html` |

### 11.2 Canonical 8-layout vocabulary

Every file ships **8 layouts** in this vocabulary. Names vary slightly per
file but the *intent* is shared across all four.

| # | Canonical intent | Job | Container plan |
|---|------------------|-----|----------------|
| 1 | **`hero-type`** — icon + benefit headline + chips, no device | Value / CTA |
| 2 | **`caption-band`** — device hero + soft-band caption at the bottom | Flow |
| 3 | **`headline-masthead`** — headline panel + eyebrow chip top, device fills the bottom | Value alt / Trust |
| 4 | **`editorial-card`** — tilted device clipping top + bottom-left panel + accent rule | Flow / Feature |
| 5 | **`vertical-bento`** — headline strip + device tile + 2 stat tiles | Trust / Feature |
| 6 | **`feature-stack`** — icon + headline + 4 numbered feature rows, no device | Trust |
| 7 | **`dual-phone`** — two devices tilted toward each other + headline panel | Feature |
| 8 | **`tilted-card`** — device inside a floating tilted card + bottom panel | Feature (premium) |

Landscape-native canvases use one of three landscape layouts instead:
- `landscape-split` — top text band + bottom device band
- `landscape-hero` — centred uppercase headline + large centred device
- `landscape-text-only` — icon left + headline/subhead right, no device

Two special surfaces ignore the spec's layout name entirely and compose
themselves from `app.name` / `app.icon` / first headline:
- `wear-os` — 384×384 watch face, icon + first headline word
- `tv-banner` — 1280×720 Android TV banner, icon + app name + tagline

The Google Play **feature graphic** (1024×500) rotates through 3
variants (`banner-bottom`, `hero-right`, `cluster-left`) by `setIndex % 3`.

### 11.3 Canvas dimensions (production)

| Surface | Canvas |
|---------|--------|
| iPhone 6.9" portrait | 1320 × 2868 |
| iPhone 6.7" portrait (legacy) | 1290 × 2796 |
| iPad Pro 13" portrait | 2064 × 2752 |
| Android phone portrait | 1440 × 2880 |
| Android tablet portrait | 1600 × 2560 |
| Wear OS | 384 × 384 |
| Android TV banner | 1280 × 720 |
| Google Play feature graphic | 1024 × 500 |

Landscape variants swap W↔H. Per-screenshot orientation is auto-detected
from the source image's natural aspect (h < w → landscape) unless the
spec sets `orientation:` explicitly.

### 11.4 Story arc, sequenced

Recommended 10-slot sequence. iOS shows the first 3 inline in search;
treat slots 1–3 as the conversion-critical sentence (**Value → Flow →
Trust**). Slots 4–8 carry feature depth; slot 10 closes with a CTA.
Landscape sets cap at 3 slots per iOS rules.

**Portrait (10 slots):** `hero-type` → `caption-band` → `feature-stack`
→ `editorial-card` → `vertical-bento` → `dual-phone` → `tilted-card` →
`caption-band` → `headline-masthead` → `hero-type` (CTA).

**Landscape (3 slots):** `landscape-hero` → `landscape-split` →
`landscape-text-only`.

### 11.5 Quick decision flowchart

```
1. What orientation are the source screenshots?
   → portrait → portrait layouts
   → landscape → landscape-* layouts
2. Which slot?
   → §11.4 above gives the recommended layout
3. Need a visual reference?
   → open design/index.html (rebuild via `npx tsx design/build-preview.ts`)
```

Open the atlas for QA / new-variant design — not for routine
spec-authoring decisions.

---

## 9. Sources

- WCAG 2.2 — [Success Criterion 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.6 Contrast (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [WebAIM — Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
- SplitMetrics — [A/B testing framework](https://splitmetrics.com/blog/master-the-official-splitmetrics-a-b-testing-validation-framework-to-win-on-the-app-store/), [iOS screenshot sizes & ASO guide](https://splitmetrics.com/blog/app-store-screenshots-aso-guide/), [creatives with people](https://splitmetrics.com/blog/app-store-creatives-with-people/)
- AppTweak — [ASO trends & benchmarks 2025](https://www.apptweak.com/en/aso-blog/aso-app-store-trends-benchmarks-report), [optimise app screenshots](https://www.apptweak.com/en/aso-blog/how-to-optimize-your-app-screenshots)
- Sensor Tower — [A/B testing case study](https://sensortower.com/blog/case-study-how-a-slash-b-testing-can-improve-your-apps-conversion-rates)
- Apple — [Product Page Optimization](https://developer.apple.com/app-store/product-page-optimization/), [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- MobileAction — [ASO A/B testing](https://www.mobileaction.co/blog/aso-a-b-testing/), [PPO 2026 guide](https://www.mobileaction.co/blog/product-page-optimization/)
- Adapty — [App Store conversion rate by category 2026](https://adapty.io/blog/app-store-conversion-rate/), [Screenshot optimisation rules](https://adapty.io/blog/app-store-screenshots-optimization/)
- AppPresser — [App Store screenshot platform-frame rule](https://apppresser.com/app-store-screenshots/)
- Moburst — [App screenshots best practices](https://www.moburst.com/blog/app-screenshots/)
- Gummicube — [App screenshot text ASO best practices](https://www.gummicube.com/blog/app-screenshot-text-aso-best-practices)
- ASOMobile — [Screenshots for App Store and Google Play 2025](https://asomobile.net/en/blog/screenshots-for-app-store-and-google-play-in-2025-a-complete-guide/)
- AppScreenshotStudio — [2026 design guide](https://medium.com/@AppScreenshotStudio/app-store-screenshots-that-convert-the-2026-design-guide-4438994689d6), [story flows 2026](https://medium.com/@AppScreenshotStudio/in-2026-the-battle-for-user-attention-on-the-app-store-and-google-play-is-no-longer-won-by-6fe9f70c707c)
- AllAccessible — [WCAG 2025 colour contrast guide](https://www.allaccessible.org/blog/color-contrast-accessibility-wcag-guide-2025)
- MDN — [Color contrast accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Perceivable/Color_contrast)
- Color Research & Application — consistent-palette brand recognition / retention effects (cited via app-mockup.com and Striven design-psychology summaries)
