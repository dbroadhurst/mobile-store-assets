# mobile-store-assets

A Claude Code plugin that generates App Store and Google Play store assets — promotional screenshots, feature graphics, and store listing copy — for any mobile app.

## What it does

- `/store-spec` — analyses your app screenshots with AI vision, writes ASO-optimised store copy, and produces a `spec.yaml` file ready for image generation
- `/store-assets` — reads `spec.yaml` and generates full-resolution promotional screenshots for all platforms using Imagen 4 or `gpt-image-1`, plus a Google Play feature graphic

## Setup

### 1. Install the plugin

```bash
# From Claude Code
/plugin install mobile-store-assets@github:davidbroadhurst/mobile-store-assets

# Or locally
/plugin install /path/to/mobile-store-assets
```

### 2. Configure your project

Copy the config template to your project:

```bash
mkdir -p marketing
cp ~/.claude/plugins/mobile-store-assets/templates/.store-config.yaml marketing/.store-config.yaml
```

Edit `marketing/.store-config.yaml` with your app name, bundle ID, brand colors, and theme.

### 3. Add your API key

Create `marketing/.env.local` (never commit this):

```bash
# Use whichever provider you have access to.
# The first key found in this file is used.
OPENAI_API_KEY=sk-...
# GOOGLE_AI_API_KEY=AIza...
```

Add to `.gitignore`:
```
marketing/.env.local
marketing/releases/*/output/
```

### 4. Prepare screenshots

Place raw screenshots in:
```
marketing/releases/{version}/screenshots/
  android-phone/
  android-tablet/
  ios-phone/
  ios-tablet/
```

### 5. Generate

```bash
# Generate spec.yaml from screenshots
/store-spec 1.0.0

# Review and edit marketing/releases/1.0.0/spec.yaml, then:

# Generate all store assets
/store-assets 1.0.0

# Or generate for a single platform
/store-assets 1.0.0 --platform ios
```

## Output

```
marketing/releases/{version}/output/
  google-play/
    phone/               → Google Play Console → Phone screenshots
    tablet/              → Google Play Console → 10" Tablet screenshots
    feature-graphic.png  → Google Play Console → Feature Graphic
    store-listing.md     → Ready-to-paste store listing text
  app-store/
    iphone-6.9/          → App Store Connect → 6.9" iPhone screenshots
    ipad-pro-12.9/       → App Store Connect → iPad Pro 12.9" screenshots
    store-listing.md     → Ready-to-paste store listing text
```

## Screenshot layouts

| Layout | Description |
|--------|-------------|
| `split-right` | Full-width phone, text top-left. Best for home/nav screens. |
| `split-left` | Same as split-right — direction is cosmetic. |
| `feature-callout` | Phone lower-left + zoomed UI region top-right. Best for data visualisation. |
| `cta` | No phone — pure brand image with app icon, name, tagline, feature list. |
| `hero-center` | Centered phone with text header. Fallback layout. |

## Image providers

| Provider | Model | API key | Notes |
|----------|-------|---------|-------|
| OpenAI | `gpt-image-1` | `OPENAI_API_KEY` | Usage-based billing, no daily quota |
| Google | `imagen-4.0-fast-generate-001` | `GOOGLE_AI_API_KEY` | ~70 images/day on standard plans |

The first key found in `marketing/.env.local` determines which provider is used.
