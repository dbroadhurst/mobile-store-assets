---
name: store-spec
description: >
  Generate or enhance an App Store / Google Play marketing spec (spec.yaml).
  Analyses screenshots with AI vision, applies ASO best practices, and authors
  an ABCD A/B test matrix — multiple internally-coherent listings varying by
  layout, theme, frame, and headline framing — that /store-assets renders
  side-by-side. Run this before /store-assets.
argument-hint: "[version] [--enhance] [--hint '...'] [--sets N] [--locales en-US,fr-FR,...] [--theme-from-screenshot path]"
allowed-tools: Read Write Bash Glob
---

## Companion skills

This skill is the **orchestrator**. The frameworks and rules it depends on
live in three companion skills — read them whenever you're authoring copy
or sizing assets, and cite them when explaining ASO trade-offs:

- **`aso-toolkit`** — content-generation frameworks: keyword research,
  metadata optimisation (3 variants per field), competitor analysis,
  audit scorecard. **Use this for every copy field you write.**
- **`ios-store-requirements`** — App Store Connect screenshot specs,
  field limits, indexing weights, PPO, CPPs, App Preview specs, 2025/26
  compliance changes.
- **`android-store-requirements`** — Google Play Console screenshot
  specs, feature graphic rules, NLP indexing, store-listing experiments,
  custom store listings, 2025/26 metadata-policy bans.

Typical citation pattern:

> "Per `aso-toolkit` §2 — Subtitle gets framing-axis variants (secondary
> keywords / outcome-promise / audience cue). Per `ios-store-requirements`
> §3, Subtitle is 30 chars and the second-highest weighted field; never
> repeat words from the App Name."

## Tooling check

!`command -v store-assets-gen >/dev/null 2>&1 && echo "✓ store-assets-gen found on PATH" || echo "⚠️  store-assets-gen not found on PATH — re-install the plugin"`

## Project config

!`cat marketing/.store-config.yaml 2>/dev/null || echo "⚠️  marketing/.store-config.yaml not found — run from project root"`

## Available releases

!`ls marketing/releases/ 2>/dev/null | sort -V | tail -10 || echo "No releases found"`

---

## Your task

Arguments: $ARGUMENTS

**Parse the arguments:**
- First bare value = version (e.g. `1.0.20`). If omitted, use the latest folder in `marketing/releases/`.
- `--enhance` = re-analyse an existing `spec.yaml`, improve weak copy and fill gaps; **preserve manual edits**.
- `--hint "..."` (alias: `--hints`) = authoritative steering note from the user. See *Applying the hint* below — this is not a freeform tag, it materially changes what gets written. If omitted on `--enhance`, the existing `spec.hint` (if any) is reused.
- `--sets N` (default `4`) = how many test sets (A, B, C, D, …) to generate. Each is a complete coherent listing variant.
- `--locales en-US,fr-FR,de-DE` = generate per-locale store text and per-screenshot translated headlines.
- `--theme-from-screenshot <path>` = sample base brand colors from a screenshot and use them to derive set themes. Run `store-assets-gen --extract-theme <path>` to get the YAML to splice in.

---

### Applying the hint

When `--hint "..."` (or legacy `--hints "..."`) is passed, treat the string as **authoritative context** about what the app does, who it's for, and the angle the user wants to lead with. The hint outranks your visual inference from screenshots when they conflict. Things commonly carried in a hint:

- *What the app actually does* (when the screenshots are ambiguous, e.g. an empty list view).
- *Who it's for* (audience cue — flows into `aso.target_audience` and identity-framed headlines).
- *What makes it different* (competitor cue — flows into `aso.positioning` and the description fold).
- *Tone / voice* (playful, clinical, premium — biases headline framing and feature pill wording).
- *Real, verifiable trust signals* (user counts, ratings, awards) — these satisfy the claim-verification rule below since the user is the source.

Apply the hint in these places, in order:

1. **Step 2 (analysis):** Read the hint *before* the screenshots. Use it as ground truth for the app's purpose; let it disambiguate any screen you can't immediately read.
2. **Step 3 (ASO copy):** Bake it into `aso.positioning`, `aso.target_audience`, primary keyword choice, the first 3 lines of the description fold, and Subtitle / Short Description framing.
3. **Step 4 (screenshot copy):** Where the hint specifies an angle (e.g. "emphasise speed"), let it bias headline + subhead wording on every screenshot.
4. **Step 5 (sets / framings):** If the hint suggests a primary framing axis (outcome / audience / urgency / etc.), make set A use that axis; rotate the others normally.
5. **Step 8 (write spec):** Persist the hint to a top-level `hint:` field in `spec.yaml` so subsequent `--enhance` runs, AI background generation, and any future regeneration carry the same steering. `store-assets-gen` mixes `spec.hint` into the motif haystack used for AI backgrounds, so a hint like *"calm, focused, for new parents"* will tint the generated backgrounds even though no copy field literally repeats those words.

**Important:** Hint content from the user satisfies the *honesty rule* — claims the user gives you in the hint (e.g. *"50,000 paying customers"*, *"no ads, no tracking"*) can be used as-is. Don't second-guess them. Without a hint, the conservative defaults still apply.

If `--enhance` is run without `--hint`, reuse the existing `spec.hint` from the file (if any) and behave as if it had been passed on the CLI. If both are present, the new `--hint` overrides.

---

### Step 1 — Find screenshots

Use Bash to list the screenshot files in each platform subfolder:
```
marketing/releases/{version}/screenshots/android-phone/
marketing/releases/{version}/screenshots/android-tablet/
marketing/releases/{version}/screenshots/ios-phone/
marketing/releases/{version}/screenshots/ios-tablet/
```
Sort filesystem-order = store-order. If `--enhance`, also read the existing `spec.yaml`.

---

### Step 2 — Read and analyse screenshots

Use the Read tool on each screenshot in `android-phone/` (other platforms are equivalent, different sizes).

For each, identify:
- Which screen of the app is shown
- The most visually striking UI element (chart, graph, button grid, data viz)
- The primary user benefit being demonstrated
- Approximate bounding box of the most interesting region (fractional `x, y, width, height`)
- Which **story-arc slot** it occupies: `value` (slot 0) → `usage` (slot 1) → `trust` (middle) → `cta` (last)

---

### Step 3 — Write the base ASO copy

**Read `aso-toolkit` first.** It carries the keyword-research, metadata-
optimisation, competitor-analysis, and audit frameworks you'll apply here.
Generate three framing variants per field internally and pick the
strongest before writing to the spec — the variants exist to give the
user PPO / experiment options later.

Apply the ASO playbook to the **base spec text**: one polished version of
the App Store / Google Play copy. The same store text is shared across
all sets within a locale — sets vary visually, not in the listing copy
itself. (PPO copy variation is a future extension.)

Pipeline (see `aso-toolkit` §1–§5 for the detail):

1. **Research** — derive primary / secondary / long-tail keywords from
   the spec's `aso.positioning`, `app.category`, and core function.
2. **Audit competitors** (optional but powerful) — name 3–5 direct
   competitors, list their primary keywords, find gaps you can fill.
3. **Generate** — author every text field below. For each, mentally draft
   3 framing variants (brand-led / function-led / outcome-led; or
   keyword-led / outcome / audience), pick the strongest.
4. **Score** — audit each draft against the §4 scorecard. Aim for ≥7/10
   on every factor before writing to the spec.
5. **Write to spec** — fill the YAML in §5 of `aso-toolkit`.

#### iOS App Store — quick playbook

Field limits and indexing weights live in `ios-store-requirements` Sections
2–3. The playbook for authoring each iOS field:

- **App Name (30):** brand + single primary keyword. Highest ranking weight.
- **Subtitle (30):** secondary keywords; **no word repeats from name** —
  Apple deduplicates and the repeat wastes your indexing surface.
- **Keyword Field (100):** comma-separated, **no spaces**; never repeat
  words from name/subtitle.
- **Description fold (first 3 lines, ~170 chars):** what the app does, top
  2–3 differentiators, social proof signal. The remaining 4,000-char body
  is **not indexed** — pure conversion text.
- **Promotional Text (170):** time-sensitive, benefit-led; updatable
  without resubmission.
- **Screenshot captions:** observed to influence rankings since June 2025
  but Apple denies OCR indexing — write them as keyword-relevant without
  stuffing (see `ios-store-requirements` §3 for the unconfirmed-but-likely
  status).

#### Google Play — quick playbook

Field limits and NLP indexing rules live in `android-store-requirements`
Sections 3–4. The playbook for authoring each Play field:

- **Title (30):** highest ranking weight. Brand + primary keyword.
- **Short Description (80):** 2nd-highest weight; shown directly in search
  results. Must read as one compelling sentence AND carry a keyword.
- **Full Description (4,000):** fully NLP-indexed. Density ~2–3% for top
  2–3 keywords; structure hook → bullets → use cases → trust → CTA.
- **What's New (500/locale):** user-facing only — **not** a primary
  indexing surface.
- **Banned in title/icon/developer name** (per Play metadata policy 2025):
  "free", "best", "top", "#1", "sale", "no ads", "ad free", "download now",
  "update", emojis, repeated punctuation, ALL CAPS (unless brand). See
  `android-store-requirements` §9.

#### Universal rules

No "#1" / "best" / unsubstantiated superlatives. Benefit-led, not feature-led. Match copy to what the app actually does. First screenshot caption is the highest-read marketing copy in the listing — make it count.

**Honesty rule (hard line):** Every claim across every field — headline, subhead, screenshot caption, feature pill, badge, store description — must be verifiable from explicit evidence in the spec, config, or user-provided context. Ask "how do I know this is true?" before each line lands. When in doubt, omit.

Hard examples that must NEVER appear without explicit user confirmation:

- "No Ads" / "Ad-free" — most free apps run ads; never assume the absence of ads.
- "Free" — assumes no IAP and no ads. Drop unless verified.
- "No Sign-up" / "Works offline" / "Private" — never assume; require evidence.
- "1M+ users" / "Trusted by millions" / "#1 in Finance" / "4.9 stars" — invented social proof.
- "Award-winning" / "Featured by Apple" / "Voted best of 20XX" — invented accolades.
- "Doctor-approved", "Banker-approved", "Built by experts" — invented authority.

When the spec/config doesn't carry the evidence, the right move is **silence on that point**, not a softer version of the same false claim. A shorter listing of true things outperforms a longer listing with one fabrication.

**Don't restate the app name on screenshot text.** The store already shows the name next to every image — repeating it is wasted pixels.

---

### Step 4 — Write base screenshot records

For each screenshot, populate the *base* values (used as fallback when a set doesn't override):

```yaml
screenshots:
  - id: home
    slot: value                  # explicit story-arc slot (overrides position-inferred)
    layout: split-right          # base/default layout
    headline: ""                 # ~5 words, benefit-led
    subheadline: ""              # ~10 words
    sources:
      android-phone: "01-home.png"
      android-tablet: "01-home.png"
      ios-phone: "01-home.png"
      ios-tablet: "01-home.png"
    callout: null                # only required when a set uses feature-callout layout for this screenshot
```

Layouts available per slot (sets rotate through these in order):

| Slot | Layouts (preference order) |
|------|----------------------------|
| `value` | `uppercase-top`, `logo-tilted`, `highlight-pill`, `caption-below` |
| `usage` | `caption-below`, `card-tilted`, `dual-phone-overlap`, `side-list` |
| `trust` | `side-list`, `dual-phone-overlap`, `caption-below`, `highlight-pill` |
| `cta`   | `text-hero` (the only no-phone layout) |

Layout descriptions:
- **`text-hero`** — no phone. Massive bold left-aligned headline (4 lines), subhead, optional trust badge (`badge_count` + `badge_label`). Used for the closing CTA slot. Set `sources: {}`.
- **`caption-below`** — phone fills the upper canvas; brand mark + 3-line centered caption beneath. Calm/premium feel.
- **`uppercase-top`** — bold ALL-CAPS headline at top (~2 lines), phone fills bottom and may bleed off-canvas. Strong opener.
- **`logo-tilted`** — brand logo + multi-line uppercase headline top-left, tilted phone bottom-right partially visible.
- **`highlight-pill`** — mixed-weight headline with a bright pill behind a `[bracketed]` keyword. Phone tilted slightly. Conversational tone.
- **`side-list`** — vertical pill list down the left edge (reads from `features:`), phone right side. Strong for "many features" framing.
- **`card-tilted`** — white rounded card with caption + trust badge in upper area, tilted phone overlapping the card corner, faded watermark text behind.
- **`dual-phone-overlap`** — two phones at slight opposing rotations, overlapping. Pill-highlighted headline above. Optional `sources_secondary:` for a different second screenshot.

Special headline syntax for `highlight-pill` and `dual-phone-overlap`:
```yaml
headline: "Quickly [FIND FEEDS] that match your interests"
```
The `[FIND FEEDS]` segment renders as a bright pill-highlighted run. Other layouts strip the brackets and render the rest as plain text — so the same headline works in every layout.

**For `text-hero`:** Populate `features:` with short claims about the app — these render as inline pills. **EVERY pill must be verifiable from explicit evidence in the spec or config.** When in doubt, leave the array empty. An empty pill area looks better than a wrong claim.

#### Claim verification rule (hard line)

Before adding ANY feature pill, badge, or copy assertion, you must point to where the evidence comes from. Ask yourself: "How do I know this is true?"

| Type of claim | Evidence required |
|---------------|-------------------|
| "Free" / "Free to use" | App is genuinely free with no in-app purchases AND no ads. If either is present, drop this. |
| "No Ads" / "Ad-free" | Spec/config explicitly says ads are disabled. Most "free" apps DO have ads — assume ads are present unless told otherwise. |
| "No Sign-up" / "No Account" | Spec/config explicitly states the app works without registration. Don't assume. |
| "Offline" / "Works offline" | Spec/config explicitly mentions offline support OR the app's primary functions don't require network. |
| "Private" / "100% Private" | Spec/config mentions privacy posture (no analytics, no third-party SDKs, etc). Vague. Avoid unless the user has stated it. |
| "Built for iPhone & iPad" | Both platforms are listed in `app.platforms` AND iOS sources exist for both phone and tablet. Verifiable from the spec. |
| Numbers (users, ratings, downloads) | The user has provided the number directly. Never round or invent. |

**Default to omission.** If you can't tie a pill to one of the rows above with evidence, drop it. A short pill row of two truthful claims beats a longer row with one false claim.

**Anti-patterns (never include without explicit user confirmation):**
- "No Ads" when the app monetises (ads are the silent default for free apps)
- "Trusted by millions" / "#1 in Finance" — superlatives without measurement
- "5-star rated" / "⭐ 4.9" without a real rating from the user
- "Used by experts" / "Banker-approved" — appeals to authority with no source

**For real, verifiable** badge data (e.g. genuine review count the user shared, real award), set `badge_count` + `badge_label` and note in your summary which fact the user verified before publishing.

Leave `sources: {}` for `text-hero` — it's the no-phone CTA closer.

**For `side-list`:** populate `features: ["World News", "Movies & TV", ...]` (up to 8). The list renders as pills down the left edge.

**For `dual-phone-overlap`:** optionally provide `sources_secondary:` with per-platform paths to show two different screens. If omitted, the primary screenshot is used twice.

---

### Step 5 — Author the test matrix (`sets:`)

Generate **N internally-coherent sets** (default 4: A, B, C, D). Each set is a **complete, shippable listing variant** — preserve the Value → Usage → Trust → CTA story arc within each set.

For each set, write:

1. A **theme**: palette derivation from the base brand colors, background style, frame, scrim.
2. **Per-screenshot overrides**: the layout that set uses for each screenshot, and an alternate **headline framing** (the subheadline expands it).

#### Theme presets to rotate through (in order)

| # | id                  | hue shift | sat shift | light shift | bg style    | frame         | scrim |
|---|---------------------|-----------|-----------|-------------|-------------|---------------|-------|
| 0 | brand-primary       |   0°      |   0       |    0        | gradient    | white-border  | 0.65  |
| 1 | warm-shift          | +20°      | +0.05     | +0.02       | mesh        | none          | 0.55  |
| 2 | cool-shift          | −20°      | +0.05     | −0.02       | bokeh       | white-border  | 0.45  |
| 3 | app-motif           |   0°      | −0.20     | −0.05       | app-motif   | none          | 0.70  |
| 4 | high-contrast       |   0°      | +0.20     | −0.05       | minimal     | white-border  | 0.65  |
| 5 | muted               | +10°      | −0.25     | +0.05       | gradient    | none          | 0.55  |
| 6 | inverted            | +180°     |   0       |    0        | mesh        | white-border  | 0.45  |
| 7 | soft-pastel         | +30°      | −0.30     | +0.15       | bokeh       | none          | 0.70  |

When N > 8, continue rotating hue by +45° from preset 0.

The `app-motif` bg style renders a brand-tinted gradient with a *dense* scatter of vector glyphs. The `gradient`, `mesh`, `bokeh`, and `geometric` styles pick up a *sparse* version of the same overlay; `minimal` renders without it.

The glyph library is intentionally generic — abstract shapes (circles, triangles, plus, diamond, half-moon) — so the plugin never asserts what your app is about. If you want category-specific subject motifs in the rendered background, switch to AI background generation: the AI prompt is built from the user-authored `app.category`, `aso.positioning`, `aso.primary_keywords`, `aso.secondary_keywords`, and `spec.hint` (verbatim, capped at 200 chars), and the model picks suitable subject motifs from that context. There is no plugin-side keyword inference or category enumeration.

#### Headline framing modes (rotate through across sets)

| #   | framing            | example                          |
|-----|--------------------|----------------------------------|
| 0   | benefit            | "See every dollar"               |
| 1   | outcome            | "Save $400 a month"              |
| 2   | social proof       | "Trusted by 50,000 users"        |
| 3   | curiosity          | "Where did your money go?"       |
| 4   | comparison         | "Less spreadsheet, more living"  |
| 5   | urgency / time     | "30 seconds to set up"           |
| 6   | identity           | "Built for busy parents"         |
| 7   | promise            | "Money clarity, every Friday"    |

For set `A` use framing 0 across all screenshots, set `B` framing 1, etc. The whole set should feel like a single voice — don't mix framings within a set.

#### Layout rotation per slot

For set `i`, slot `s`: pick `VALID_LAYOUTS[s][i % len(VALID_LAYOUTS[s])]`. The CLI does this automatically when no override is provided, but writing it explicitly in the spec lets the user edit per-set choices.

---

### Step 6 — If `--theme-from-screenshot` was passed

Run:
```bash
store-assets-gen --extract-theme path/to/screenshot.png
```

Use the printed `primary_color` / `secondary_color` to update `brand.primary_color` / `brand.secondary_color` in `marketing/.store-config.yaml`. The set themes (Step 5) automatically derive from these.

---

### Step 7 — If `--locales` was passed

For each non-default locale (e.g. `fr-FR`, `de-DE`):
- Translate the base `google_play` and `app_store` blocks → `locales: { fr-FR: { google_play: …, app_store: … } }`
- Translate per-screenshot `headline` / `subheadline` → each screenshot gets `locales: { fr-FR: { headline, subheadline } }`

Apply ASO rules per locale (limits, no superlatives, local search terms — direct translation often misses intent).

---

### Step 8 — Write spec.yaml

Write to `marketing/releases/{version}/spec.yaml` using this structure:

```yaml
# ─── Store Marketing Spec ─────────────────────────────────────────────────────
# Generated by /store-spec on {date}. Edit freely — /store-assets reads this.
# Re-run with --enhance to improve copy without overwriting your edits.

version: "{version}"
generated: "{date}"

# ── Steering hint (from --hint or carried over from previous run) ────────────
# Authoritative context: what the app does, who it's for, the angle to lead
# with, and any real trust signals. Read before regenerating copy or art.
hint: ""

# ── ASO strategy ──────────────────────────────────────────────────────────────
aso:
  primary_keywords: [keyword one, keyword two]
  secondary_keywords: [keyword three]
  positioning: "{one sentence}"

# ── Google Play text ──────────────────────────────────────────────────────────
google_play:
  title: ""                   # max 30
  short_description: ""       # max 80
  full_description: |         # max 4000
    ...
  recent_changes: ""          # max 500

# ── App Store text ────────────────────────────────────────────────────────────
app_store:
  name: ""                    # max 30
  subtitle: ""                # max 30
  description: |              # max 4000
    ...
  keywords: ""                # max 100
  promotional_text: ""        # max 170

# ── Screenshots (base / fallback) ─────────────────────────────────────────────
screenshots:
  - id: home
    slot: value
    layout: uppercase-top              # base/default; sets may override per ABCD
    headline: "TRACK YOUR MONEY"
    subheadline: "Base supporting line"
    sources:
      android-phone:  "01-home.png"
      android-tablet: "01-home.png"
      ios-phone:      "01-home.png"
      ios-tablet:     "01-home.png"

  # ... usage, trust screenshots ...

  - id: cta
    slot: cta
    layout: text-hero                  # the no-phone closer
    headline: "Money clarity, every Friday"
    subheadline: "Track, plan, and save without the spreadsheet."
    # Feature pills MUST be verifiable. See "Honesty rule" above. Common safe
    # claims: ["Free", "No Sign-up", "Offline"] — but only when each is true.
    # Default to fewer-true-claims over more-plausible-but-unverified.
    features: []
    # badge_count / badge_label only when a real, user-supplied number exists
    sources: {}

# ── Test matrix ───────────────────────────────────────────────────────────────
# N internally-coherent sets. Each set ships as a complete listing variant.
sets:
  - id: A
    theme:
      id: brand-primary
      palette_name: "{primary_name} + {secondary_name}"
      primary:   "#3B7AC1"
      secondary: "#F2A93B"
      accent:    "#3B7AC1"
      bg_from:   "#1F4A78"
      bg_to:     "#D9961C"
      bg_style:  gradient
      frame:     white-border
      scrim:     0.65
      phone_top_offset: 0.30
      headline_color:    "#FFFFFF"
      subheadline_color: "rgba(255,255,255,0.88)"
    screenshots:
      home:
        layout: split-right
        headline: "See every dollar"
        subheadline: "A clear picture of your spending, every day"
      # ... usage, trust, cta ...

  - id: B
    theme:
      id: warm-shift
      # ... full theme block ...
    screenshots:
      home:
        layout: hero-center
        headline: "Save $400 a month"
        subheadline: "Real savings, no spreadsheet, no guilt"
      # ...

  - id: C
    # ...

  - id: D
    # ...

# ── Locales (only when --locales was used) ────────────────────────────────────
# locales:
#   fr-FR:
#     google_play: { ... }
#     app_store:   { ... }
```

---

### Step 9 — After writing

Print:
- Version, output path, set count, locale count
- Any character-limit warnings on copy
- Total render plan: `N sets × M platforms × L locales × K screenshots = X images`
- Next step: `Review and edit spec.yaml, then run /store-assets {version}`

If sample renders would help the user pick a winner, suggest:
```bash
/store-assets {version} --dry-run    # preview all sets in seconds, no API cost
```

---

### ASO Reference — Key Numbers

| Metric | Value |
|--------|-------|
| iOS portrait screenshots in search | 3 |
| iOS landscape in search | 1 |
| App Store "Read More" expansion rate | ~2–2.5% |
| Top iOS apps using portrait | 96% |
| Optimised screenshot CVR lift | 20–35% |
| Google Play description keyword density | 2.5–3% |
| iOS caption indexing (keyword signal) | Observed since June 2025 (Apple denies OCR — see ios skill §3) |
| Apple PPO max test variants | 3 (over original) |
| Apple PPO max test duration | 90 days |
| Apple Custom Product Pages limit | 70 per app (raised Oct 2025) |
| Google Play feature graphic | 1024×500 px |
| Google Play store-listing experiments | 5 localised + 1 default concurrent |
| Google Play Custom Store Listings | 50 per app (100 for partners) |

For the canonical, source-cited numbers, defer to:
- `ios-store-requirements` for iOS specifics
- `android-store-requirements` for Android specifics

---

## Appendix — design decisions captured from production feedback

This section records architectural / content rules established through
real-world use. Read it before authoring; don't re-litigate these.

### Layout system

- **8 layouts only**, mapped to story-arc slots via the matrix planner:
  - `value`: `uppercase-top` → `logo-tilted` → `highlight-pill` → `caption-below`
  - `usage`: `caption-below` → `card-tilted` → `dual-phone-overlap` → `side-list`
  - `trust`: `side-list` → `dual-phone-overlap` → `caption-below` → `highlight-pill`
  - `cta`:   `text-hero` (the only no-phone closer)
- Each set rotates layouts within a slot — set A uses index 0, set B uses
  index 1, etc, wrapping when N exceeds the list.
- Legacy layout names (`cta`, `hero-center`, `split-right`, `split-left`,
  `feature-callout`) are auto-migrated by the matrix planner; they no
  longer exist in the renderer.

### Screenshot is the source of truth for phone size and aspect

- Every layout that draws a phone reads `sharp.metadata()` on the source
  screenshot and derives the device frame's height as
  `phoneW * (height/width)`. No layout uses a hardcoded ratio.
- iPad sources render with iPad-shaped frames; iPhone sources iPhone-shaped.
- Mismatched aspect (e.g. iPhone source rendered into an iPad canvas) is
  the user's choice — the layout never stretches or clips the screenshot.

### One background per (theme × orientation)

- The matrix uses **8 unique backgrounds total** (4 themes × 2 orientations
  — portrait + landscape), reused across every platform via sharp's
  `cover + centre` resize.
- AI runs make 8 API calls for the entire matrix, not 80.
- In-memory bucket cache + disk cache (`marketing/.cache/backgrounds/`)
  skip regeneration on subsequent runs.

### AI background defaults

- When `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` is present in
  `marketing/.env.local`, AI backgrounds are used **by default**. CSS/SVG
  is the explicit fallback (`--css-bg`).
- Prompts bias toward graphic / illustrative output ("flat vector
  illustration style, abstract graphic design, no photograph") and weave
  in app context derived from `spec.aso.primary_keywords`,
  `spec.aso.positioning`, and `config.app.category`.
- Every prompt ends with a text-safe directive: "open uncluttered space at
  the top and bottom for headline text overlay, visual interest
  concentrated in the centre".

### Visual hierarchy fixes applied during production review

- **App-name wordmarks removed** from every layout (`uppercase-top`,
  `caption-below`, `logo-tilted`, `card-tilted`). The store already shows
  the app name next to every screenshot — repeating it is wasted pixels.
- **Subhead sizes bumped**: `uppercase-top` 0.040 → 0.050; `caption-below`
  factor 0.55 → 0.62; `logo-tilted` 0.045 → 0.050; `highlight-pill` /
  `side-list` / `dual-phone-overlap` 0.040 → 0.048; with comfortable gap
  (H × 0.038) between headline and subhead.
- **Subheads always wrap and `fitText`** so long copy never clips the
  canvas edge.
- **Headline `charRatio` 0.68** for ALL-CAPS bold layouts (was 0.62 — too
  optimistic for wide bold caps).
- **Side-list subhead** anchors to `max(phone-bottom, list-bottom) + gap`,
  not absolute `H × 0.95`.
- **Card-tilted** auto-sizes the card to content height (was fixed
  `H × 0.34` with huge negative space). Trust badge only renders when
  `badge_count` is explicitly authored.
- **Highlight-pill / dual-phone-overlap**: bracketed `[KEYWORDS]` render
  as bold accent-coloured text, **no background pill** (the coloured
  block was too heavy).
- **Adaptive text colour**: `pickTextColorsForGradient()` in `colors.ts`
  computes WCAG luminance on the gradient midpoint and chooses
  white-on-dark or dark-on-light per theme. `ensureAccentContrast()`
  iteratively adjusts the accent until 4.5:1 against the background.
- **Text-shadow halo**: every overlay SVG includes a `<style>` block
  applying `paint-order: stroke fill; stroke: rgba(0,0,0,0.45)` so each
  glyph has a subtle dark halo. Insurance for borderline contrast cases.
- **Device frame slimmed**: bezel ~1.8% of phone width (was 4%). Always
  shown — `frame: 'none'` no longer produces a frameless render. Camera
  pill smaller and darker for a marketing-mockup feel.
- **Feature graphic** now includes the app icon (62% of canvas height,
  rounded square) on the left, app name + subtitle on the right. No
  scrim — the theme background carries contrast on its own.
- **Text-hero**: icon centred at top, `W * 0.24` (was 0.18). Star/review-
  count badge removed. Optional honest "feature pill" row only renders
  when `screenshot.features` is populated.
- **Dual-phone variety**: the planner auto-pairs a sibling screenshot's
  source for the secondary phone when `sources_secondary` isn't authored
  — two duplicate phones don't read as variety.

### Content honesty (hard line, recap)

- Every claim across every field must be verifiable from explicit evidence.
- Default to omission. A shorter listing of true things outperforms a
  longer listing with one fabrication.
- "No Ads" in particular: never assume; most free apps run ads. Only
  include if the user has explicitly stated ads are absent.
- See the "Honesty rule" section above for the full table of common
  claims and the evidence each requires.

### Review workflow

- `/store-assets` always emits `marketing/releases/{version}/manifest.json`
  + `marketing/releases/{version}/review.html` alongside the output.
- The review page is self-contained (manifest is inlined as a JS literal,
  no fetch — works on `file://`).
- Per-image vote + comment + global comment, persisted to localStorage,
  exportable as `reviews.json`. Filter by platform/set/status; group by
  set, screenshot, layout, device family, platform, or flat.
- Aspect ratios in the preview thumbnails match each platform's actual
  canvas (1320/2868 iPhone, 2048/2732 iPad, 1440/2880 Android phone, etc).
