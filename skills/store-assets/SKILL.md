---
name: store-assets
description: >
  Render the App Store / Google Play test matrix from spec.yaml. Produces
  ABCD sets — multiple internally-coherent listing variants. Backgrounds use
  Imagen / gpt-image-1 by default when an `OPENAI_API_KEY` or
  `GOOGLE_AI_API_KEY` is present in marketing/.env.local; falls back to
  deterministic CSS/SVG composition (free, instant) when no key is found.
  Force either path with --css-bg / --use-ai-bg. Run /store-spec first to
  author the matrix.
argument-hint: "[version] [--sets N|A,B,C] [--platform p1,p2|all] [--locales en-US,...] [--include-6.5] [--css-bg | --use-ai-bg] [--provider openai|google] [--regen id|all] [--dry-run] [--images-only] [--text-only]"
allowed-tools: Read Write Bash
---

## Tooling check

!`command -v store-assets-gen >/dev/null 2>&1 && echo "✓ store-assets-gen found on PATH" || echo "⚠️  store-assets-gen not found on PATH — re-install the plugin"`

## Project config

!`cat marketing/.store-config.yaml 2>/dev/null || echo "⚠️  marketing/.store-config.yaml not found"`

## Spec file

!`VERSION=$(echo "$ARGUMENTS" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1); \
  [ -z "$VERSION" ] && VERSION=$(ls marketing/releases/ 2>/dev/null | sort -V | tail -1); \
  cat "marketing/releases/${VERSION}/spec.yaml" 2>/dev/null || echo "⚠️  spec.yaml not found for ${VERSION} — run /store-spec first"`

---

## Your task

Arguments: $ARGUMENTS

**Parse the arguments:**
- First bare version number = version. If omitted, use the latest in `marketing/releases/`.
- `--sets <N>` (default `4`) or `--sets A,B,C` — how many / which sets from the matrix to render. `--sets 1` = single-set mode (matches pre-matrix behaviour).
- `--platform <list>` — comma-separated platform keys or `all`. Defaults to default-enabled platforms (current store-required sizes).
- **Default-enabled platforms** (always rendered with `--platform all`):
  `ios-phone` (1320×2868, iPhone 6.9"), `ios-tablet-13` (2064×2752, iPad Pro 13"), `ios-tablet` (2048×2732, iPad Pro 12.9" — kept default for back-compat), `android-phone` (1440×2880), `android-tablet` (1600×2560 / 10")
- **Opt-in platforms** (turn on via `--include-<key>` or `--include-all`):
  `--include-6.7` (iPhone 6.7", 1290×2796), `--include-6.5` (iPhone 6.5", 1242×2688), `--include-12.9` (iPad Pro 12.9" alias), `--include-7-tablet` (Android 7" tablet, 1200×1920), `--include-wear` (Wear OS, 384×384), `--include-tv-banner` (Android TV banner, 1280×720)
- **`--include-all`** — turn on every opt-in platform in one go (the maximal asset bundle).
- `--locales en-US,fr-FR,...` — render per-locale variants. Each (locale × set) gets its own subfolder.
- **Background mode is auto-detected.** When `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` is present in `marketing/.env.local`, AI backgrounds (Imagen / gpt-image-1) are used — these carry app-themed motifs derived from `app.category`, `aso.positioning`, `aso.primary_keywords`, and `spec.hint`. When no key is present, the CLI falls back to deterministic CSS/SVG composition. The user can override with the flags below.
- `--use-ai-bg` — force AI even when auto-detect would have chosen CSS (errors if no key is set).
- `--css-bg` — force CSS/SVG even when keys are present (offline / cost-free re-renders).
- `--provider openai|google` — force a provider when both keys are present.
- `--regen <id|id1,id2|all>` — bypass the AI background disk cache for the listed theme / set ids. Only relevant when AI mode is active.
- `--dry-run` — same as a live run but never calls the AI provider; CSS/SVG renders only. Good for free iteration.
- `--images-only` — skip writing store-listing.md files.
- `--text-only` — skip image generation.

---

### Step 1 — Run the CLI

```bash
store-assets-gen \
  --version {version} \
  --root "$(pwd)" \
  --spec "marketing/releases/{version}/spec.yaml" \
  --config "marketing/.store-config.yaml" \
  --screenshots "marketing/releases/{version}/screenshots" \
  --output "marketing/releases/{version}/output" \
  --platform {platform} \
  {extra-flags}
```

Append flags as the user passed them: `--sets`, `--locales`, `--use-ai-bg`, `--provider`, `--regen`, `--include-6.5`, `--dry-run`, `--images-only`, `--text-only`.

Stream output. The CLI logs each set, screenshot, platform, and write path.

---

### Step 2 — Summary

After the run, surface:
- Total images produced (sets × platforms × locales × screenshots)
- Output structure: `output/[locale/]set-X/{google-play,app-store}/...`
- Any character-limit warnings printed by the CLI
- The auto-emitted **review page**: `marketing/releases/{version}/review.html` — point the user to open it in their browser. It loads `manifest.json` from the same folder and shows every render with thumbs-up / thumbs-down + per-image comment + global comment, persisting locally and exporting `reviews.json` they can hand back for follow-up changes.
- Suggest: review sets visually, pick favourites, ship to Apple PPO (max 3 variants) and Google Play store-listing experiments

---

### Output layout

```
output/
  set-A/
    google-play/{phone,tablet,feature-graphic.png,store-listing.md}
    app-store/{iphone-6.9,ipad-pro-12.9,store-listing.md}
  set-B/  ...
  set-C/  ...
  set-D/  ...
```

With locales:
```
output/en-US/set-A/...
output/fr-FR/set-A/...
```

If `--sets 1` was used, the `set-X/` segment is omitted (matches pre-matrix output paths).
