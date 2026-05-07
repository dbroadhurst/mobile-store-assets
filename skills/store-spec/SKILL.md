---
name: store-spec
description: >
  Generate or enhance an App Store / Google Play marketing spec (spec.yaml) from
  screenshots. Analyses screenshots with AI vision, applies ASO best practices,
  assigns creative layouts, and picks feature callout regions automatically.
  Run this before /store-assets.
argument-hint: "[version] [--enhance] [--hints 'your notes']"
allowed-tools: Read Write Bash Glob
---

## Project config

!`cat marketing/.store-config.yaml 2>/dev/null || echo "⚠️  marketing/.store-config.yaml not found — run from project root"`

## Available releases

!`ls marketing/releases/ 2>/dev/null | sort -V | tail -10 || echo "No releases found"`

---

## Your task

Arguments: $ARGUMENTS

**Parse the arguments:**
- First bare value = version (e.g. `1.0.20`). If omitted, use the latest folder in `marketing/releases/`.
- `--enhance` = re-analyse an existing `spec.yaml`, improve weak copy and fill gaps, but **preserve any manual edits** (especially headlines/subheadlines the user has already written).
- `--hints "..."` = extra context to factor in (target market, upcoming features, tone, etc.).

---

### Step 1 — Find screenshots

Use the Bash tool to list the screenshot files in each platform subfolder:
```
marketing/releases/{version}/screenshots/android-phone/
marketing/releases/{version}/screenshots/android-tablet/
marketing/releases/{version}/screenshots/ios-phone/
marketing/releases/{version}/screenshots/ios-tablet/
```
List them sorted (filesystem order = store order). If `--enhance`, also read the existing `spec.yaml`.

---

### Step 2 — Read and analyse screenshots

Use the Read tool to open each screenshot in `android-phone/` (same features as other platforms, just different size).

For each screenshot identify:
- Which screen of the app is shown
- The most visually striking UI element (chart, graph, data visualisation, button grid, etc.)
- The primary user benefit being demonstrated
- Approximate bounding box of the most interesting element (as fractions: x, y, width, height where 0,0 = top-left)

---

### Step 3 — Assign layouts

Apply the **Value → Usage → Trust** story arc:

**4 screenshots (standard):**
1. First → `split-right`: core value promise — what do I get? Establishes all major features
2. Second → `feature-callout`: hero feature — how does it work? Best for data visualisation (pie charts, graphs, stats)
3. Third → `split-left`: differentiation — why this app? Mirrors energy of #2, different feature
4. Fourth → `cta`: pure brand image — download trigger; no phone screenshot

**3 screenshots:**
1. `split-right`, 2. `feature-callout`, 3. `cta`

**5+ screenshots:**
Alternate `split-right` / `split-left` for middle ones; last = `cta`.

**Layout assignment rules:**
- `feature-callout` requires a clear visually-interesting region to zoom into — only assign it when such a region exists
- `split-*` works best for navigation, home, list, and input screens
- `cta` never has a source screenshot — it is a full AI-generated brand image
- Only use `feature-callout` if the screenshot has distinct data visualisation; otherwise use `split-*`

---

### Step 4 — Write store copy (ASO best practices)

> **Expert context:** You are writing for an experienced mobile marketer who understands ASO mechanics. Apply all of the following rigorously.

#### iOS App Store — field weight hierarchy

| Field | Limit | Indexed? | Search weight |
|-------|-------|----------|---------------|
| App Name | 30 chars | ✓ | Highest |
| Subtitle | 30 chars | ✓ | High |
| Screenshot captions | — | ✓ (as of June 2025) | Medium — now a keyword signal |
| Keyword Field | 100 chars | ✓ | Medium |
| Description | 4,000 chars | ✗ | Not ranked — conversion only |
| Promotional Text | 170 chars | ✗ | Not ranked — shown above description |

**iOS Name (30 chars):** Brand name + single primary keyword. The name carries the most ranking weight of any field. Include the highest-intent keyword users would actually search for, not a marketing tagline.

**iOS Subtitle (30 chars):** Secondary keywords + supporting value proposition. Second-highest ranking weight. Complement the name — do not repeat any word already in the name.

**iOS Keyword Field (100 chars):** Comma-separated, no spaces after commas. **Never repeat** any word already in the name or subtitle — Apple deduplicates and the repeat wastes space. Target long-tail terms (3+ words), secondary intents, and competitor adjacent terms with lower competition. Long-tail queries convert better because intent is specific.

**iOS Description:** Only **2–2.5% of product page visitors** ever tap "Read More". The description does not affect search ranking on iOS. Treat it as a conversion tool, not a keyword vehicle.
- **First 3 lines (the fold, ~170 chars):** This is what ~97% of visitors actually read. Open with the core value proposition. Never open with the app name. Do not waste the fold on filler.
  - Line 1: What the app does and for whom, in plain language
  - Line 2: Top 2–3 differentiators or benefit bullets
  - Line 3: Social proof signal or urgency
- **Remainder:** Feature bullets, use cases, trust signals. Concise sections with clear headers.

**iOS Promotional Text (170 chars):** Shown above the description. Updatable without App Store review — use it for time-sensitive messaging (new feature, seasonal offer). Keep it concrete and benefit-led.

**Screenshot captions — new keyword signal (iOS, June 2025):** Apple now indexes screenshot overlay text as keyword metadata. Treat headline text on screenshots as a keyword placement opportunity, not just a design choice. Align 2–3 key search terms across screenshot captions naturally — do not keyword-stuff captions.

#### Google Play — field weight hierarchy

| Field | Limit | Indexed? | Notes |
|-------|-------|----------|-------|
| Title | 30 chars | ✓ | Highest weight |
| Short Description | 80 chars | ✓ | 2nd highest; shown in search results |
| Full Description | 4,000 chars | ✓ (NLP indexed) | 2.5–3% keyword density |
| Developer Name | — | ✓ | Often overlooked |

**Google Play Title (30 chars):** Brand + primary keyword. Highest ranking signal on Google Play.

**Google Play Short Description (80 chars):** Second most important ranking field. Also appears below the title in search results and on the product page — it's the only copy most users read after the title. Must work as both keyword signal AND a compelling single sentence. Google's NLP penalises stuffing — write natural prose with intentional keyword placement.

**Google Play Full Description (4,000 chars):** Google indexes every word using NLP-based semantic indexing. This is the primary keyword vehicle on Android.
- Recommended keyword density: **2.5–3%** for primary terms
- Repeat top keywords ~**5×** naturally throughout
- Structure: hook paragraph → feature bullets → use cases → trust signals → CTA
- Plain text only (no HTML). Line breaks and emoji bullets improve scannability.
- Google detects and penalises keyword stuffing — use keywords in meaningful sentences, not lists of terms.
- Embed long-tail phrases naturally ("monthly repayment calculator", "home loan affordability", etc.)

**Google Play Recent Changes (500 chars):** Keep it specific. Users considering an update will read this — "performance improvements" is meaningless; "faster chart rendering and improved slider sensitivity" is not.

#### Rules for all copy

- No "#1", "best", "leading", or unsubstantiated superlatives
- Benefit-led, not feature-led: "See your total interest before you commit" not "Has an interest calculator"
- Users decide in 3–6 seconds — every word must earn its place
- Match copy exactly to what the app actually does — never oversell
- First screenshot caption is the highest-read marketing copy in the listing — make it count

---

### Step 5 — Assign screenshot headlines and subheadlines

**Critical iOS fact:** On iOS, portrait screenshots show **3 screenshots in search results**. Landscape shows only **1**. This is why portrait is non-negotiable for iPhone — it triples your search impression surface. 96% of top iOS apps use portrait for iPhone screenshots.

**Screenshot 1 (highest leverage):** On iOS, this is a standalone ad unit in search results. On Android, the feature graphic plays this role. Write the headline for screenshot 1 as if it is the only text the user will read — it often is.

**Headline guidelines:**
- Max ~5 words — bold, scannable at a glance (~1 second reading time)
- Benefit-led, specific, concrete ("See Every Dollar" not "Interest Calculator")
- Action or outcome framing outperforms feature naming
- Align with the primary keyword for that screen (screenshot caption text is now an iOS keyword signal)

**Subheadline guidelines:**
- Max ~10 words — supports and expands the headline
- Complete the thought the headline started
- Do not repeat the headline — add context or a second benefit

---

### Step 6 — Generate Imagen background prompts

**Critical rule:** Never include hex color codes (e.g. `#99E0DB`) in Imagen prompts — Imagen will render them as visible text in the image. Always describe colors by name.

Create a **shared visual theme** across all screenshots so they look like a cohesive set:
- All prompts draw from the same color family (use the names of `primary_color` and `secondary_color` from config — e.g. "deep ocean teal", "bright aqua", "pale mint")
- All prompts share the brand motif (from `brand.theme_motif` in config)
- Each prompt varies composition to suit its layout and subject

**Proven Imagen prompt structure:**
```
[style] [lighting] of [subject/motif] on [background descriptor], [composition directive], [mood/color], no text, no numbers, no letters, no words
```

**Negative prompts:** Always end every prompt with `no text, no numbers, no letters, no words`. Use descriptive terms for what to avoid — this is more effective than `"do not include"` phrasing.

**Composition control for text overlay space:**
- `split-*` layouts: text fills the top ~30% of canvas — use prompts with "open upper zone", "clear top third", or "subject in lower two-thirds"
- `feature-callout` layouts: text sits at top and bottom — keep middle clear
- `cta` layout: no phone competes for attention — use a richer, more dramatic composition with "wide open composition", "bokeh background", "radial light bloom from center"
- `hero-center` layouts: text overlaid center — use prompts with "diffuse central lighting", "uncluttered background"

**Styles that produce clean composable backgrounds:**
- `Soft gradient wash`, `studio product photography`, `minimal flat color field`, `aerial abstract`
- Avoid: `"neon"`, `"billboard"`, `"poster"`, `"signage"` — these semantically invite text rendering

**Lighting specificity matters:** `"diffused studio light"`, `"soft natural window light"`, `"bokeh depth of field"` produce controllable results. `"dramatic"` or `"cinematic neon"` tends to produce text artifacts.

**CTA layout prompt (richer):** Since the CTA has no phone, use a premium, environmental composition: `"Wide panoramic shot of [motif], radial light bloom from center, deep [brand_color] at edges transitioning to bright [brand_color_2] at center, bokeh abstract depth, premium brand feel, wide open composition, no text, no numbers, no letters"`

---

### Step 7 — Write spec.yaml

Write the completed spec to `marketing/releases/{version}/spec.yaml`.

Use this exact YAML structure:

```yaml
# ─── Store Marketing Spec ─────────────────────────────────────────────────────
# Generated by /store-spec on {date}. Edit freely — /store-assets reads this file.
# Re-run with --enhance to improve copy without overwriting your edits.

version: "{version}"
generated: "{date}"

# ── ASO strategy ──────────────────────────────────────────────────────────────
aso:
  primary_keywords:
    - keyword one
    - keyword two
  secondary_keywords:
    - keyword three
  target_audience: "{from config or inferred}"
  positioning: "{one sentence unique angle}"

# ── Google Play text ──────────────────────────────────────────────────────────
google_play:
  title: ""                   # max 30 chars
  short_description: ""       # max 80 chars
  full_description: |         # max 4000 chars; 2.5-3% keyword density; ~5x primary keywords
    ...
  recent_changes: ""          # max 500 chars; specific, not generic

# ── App Store text ────────────────────────────────────────────────────────────
app_store:
  name: ""                    # max 30 chars; brand + primary keyword; highest ranking weight
  subtitle: ""                # max 30 chars; secondary keywords; no word repeats from name
  description: |              # max 4000 chars; first 3 lines = the fold (~97% of users stop here)
    ...
  keywords: ""                # max 100 chars; comma-separated, no spaces; no repeats from name/subtitle
  promotional_text: ""        # max 170 chars; updatable without review; benefit-led

# ── Screenshots ───────────────────────────────────────────────────────────────
# Story arc: Value (screenshot 1) → Usage (screenshot 2) → Trust (screenshot 3) → CTA
# iOS portrait = 3 screenshots shown in search results; landscape = 1. Default to portrait.
# Screenshot captions are now indexed as keywords on iOS (June 2025) — align with search terms.
# Reorder or remove entries to control store ordering.

screenshots:
  - id: home
    layout: split-right        # hero-center | split-right | split-left | feature-callout | cta
    headline: ""               # ~5 words max — bold, benefit-led, scannable at 1 second
    subheadline: ""            # ~10 words max — expands headline, adds second benefit
    imagen_prompt: ""          # unique background prompt; no hex codes; end with: no text, no numbers, no letters
    callout: null              # only for feature-callout layout (see below)
    sources:
      android-phone:  "filename.png"
      android-tablet: "filename.png"
      ios-phone:      "filename.png"
      ios-tablet:     "filename.png"

  # feature-callout example:
  # - id: chart-feature
  #   layout: feature-callout
  #   callout:
  #     x: 0.05       # fraction of screenshot width from left
  #     y: 0.18       # fraction of screenshot height from top
  #     width: 0.90   # fraction of screenshot width
  #     height: 0.42  # fraction of screenshot height

  - id: cta
    layout: cta
    headline: ""               # app name or top-line value promise
    subheadline: ""            # strongest trust signal or differentiator
    features:
      - "Feature One"
      - "Feature Two"
      - "Feature Three"
    imagen_prompt: ""          # richer/more dramatic; radial or bokeh composition; no text, no numbers, no letters
    sources: {}                # no screenshot needed for cta layout

# ── Visual style ──────────────────────────────────────────────────────────────
style:
  theme_prompt: ""             # shared motif injected into every imagen_prompt; no hex codes
  device_frame: white-border   # white-border | none
  headline_color: "#FFFFFF"
  subheadline_color: "rgba(255,255,255,0.88)"
  accent_color: "{primary_color from config}"
```

**After writing the file**, print a summary showing:
- Version and output path
- Number of screenshots and their assigned layouts
- Any character limit warnings
- Keyword field: flag any words repeated between name/subtitle/keywords
- Next step: "Review and edit `spec.yaml`, then run `/store-assets {version}`"

---

### ASO Reference — Key Numbers

| Metric | Value |
|--------|-------|
| iOS search: portrait screenshots shown | 3 |
| iOS search: landscape screenshots shown | 1 |
| Users who expand App Store "Read More" | ~2–2.5% |
| Top iOS apps using portrait screenshots | 96% |
| Screenshot CVR lift (optimised vs baseline) | 20–35% |
| Google Play: text overlay max coverage | 20% of image area |
| Google Play: full description keyword density | 2.5–3% |
| Google Play: repeat primary keywords naturally | ~5× |
| iOS screenshot caption indexing (keyword signal) | Since June 2025 |
| Keyword boost from caption alignment (iOS) | up to 22% |
| Apple PPO: max test variants | 3 |
| Apple PPO: testable assets | icon, screenshots, preview video only |
| Apple PPO: max test duration | 90 days |
| Feature graphic dimensions | 1024×500px |
| Feature graphic: keep center clear for | video play button overlay |
