---
name: store-assets
description: >
  Generate iOS and Android store assets from a spec.yaml file.
  Writes store-listing.md text files directly, then runs the image generation
  script (Imagen 4 / gpt-image-1 + Sharp) to produce promotional screenshots
  and the Google Play feature graphic. Run /store-spec first to create the spec.
argument-hint: "[version] [--platform android|ios|all] [--images-only] [--text-only]"
allowed-tools: Read Write Bash
---

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
- First bare version number = version (e.g. `1.0.20`). If omitted, use the latest in `marketing/releases/`.
- `--platform android|ios|all` — defaults to all
- `--images-only` — skip writing store-listing.md files
- `--text-only` — skip image generation

---

### Step 1 — Write store-listing.md files (unless --images-only)

Read the spec above and write two formatted files that can be directly copy-pasted into the store consoles.

**Write `marketing/releases/{version}/output/google-play/store-listing.md`:**

```markdown
# Google Play Store Listing — {App Name} {version}
_Generated {date} · Ready to paste into Google Play Console → Store listing_

---

## Title  ({n}/30 chars)
{title}

## Short Description  ({n}/80 chars)
{short_description}

## Full Description  ({n}/4000 chars)
{full_description}

## What's New  ({n}/500 chars)
{recent_changes}

---
_Upload screenshots from: `output/google-play/phone/` and `output/google-play/tablet/`_
_Upload feature graphic from: `output/google-play/feature-graphic.png`_
```

**Write `marketing/releases/{version}/output/app-store/store-listing.md`:**

```markdown
# App Store Listing — {App Name} {version}
_Generated {date} · Ready to paste into App Store Connect → App Information_

---

## App Name  ({n}/30 chars)
{name}

## Subtitle  ({n}/30 chars)
{subtitle}

## Promotional Text  ({n}/170 chars)
{promotional_text}

## Description  ({n}/4000 chars)
{description}

## Keywords  ({n}/100 chars)
{keywords}

---
_Upload screenshots from: `output/app-store/iphone-6.9/` and `output/app-store/ipad-pro-12.9/`_
```

Show a character count warning for any field that exceeds its limit.

---

### Step 2 — Run image generation (unless --text-only)

Run the image script:

```bash
store-assets-gen \
  --version {version} \
  --root "$(pwd)" \
  --spec "marketing/releases/{version}/spec.yaml" \
  --config "marketing/.store-config.yaml" \
  --screenshots "marketing/releases/{version}/screenshots" \
  --output "marketing/releases/{version}/output" \
  --platform {platform}
```

Stream the output so the user can follow progress.

If the script exits with an error, show the error clearly and suggest:
- Check `marketing/.env.local` contains `OPENAI_API_KEY=...` or `GOOGLE_AI_API_KEY=...`
- Check screenshot files exist in the correct platform subfolders
- Check `spec.yaml` sources match actual filenames

---

### Step 3 — Summary

After everything completes, print a clean summary:
- Files written (store-listing.md paths)
- Images generated (count per platform)
- Output root path
- Next steps: copy to store consoles
