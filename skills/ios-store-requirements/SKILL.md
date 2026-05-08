---
name: ios-store-requirements
description: >
  Authoritative reference for App Store Connect requirements (May 2026):
  screenshot specs, metadata field limits, ASO indexing behaviour, Product
  Page Optimization (PPO), Custom Product Pages (CPPs), App Preview videos,
  localisation, and recent Apple policy compliance. Read this whenever you
  are authoring iOS store copy, sizing iOS screenshots, or advising on PPO
  / CPP / ASO. The /store-spec skill consults this for every iOS field.
---

# iOS App Store Connect — Requirements & ASO Reference

This skill captures the current App Store Connect rules so `/store-spec`
authors copy and screenshots that submit cleanly. All facts include source
URLs; uncertainties are flagged explicitly.

---

## 1. Screenshot specifications

### Orientation — both portrait AND landscape are accepted

Apple accepts portrait, landscape, or a mix within the same set. For
landscape screenshots, **the resolution is the portrait resolution with
width and height swapped**. Search results show 3 portrait OR 1 landscape
screenshot — portrait wins on impression-share for most apps, but
landscape-native apps (games, video, navigation, productivity tablets)
should ship landscape.

### Required (current primary submission)

| Device | Portrait | Landscape | Notes |
|--------|----------|-----------|-------|
| iPhone 6.9" (16/17 Pro Max) | **1320 × 2868** | **2868 × 1320** | Current required primary iPhone size |
| iPad Pro 13" (M4)           | **2064 × 2752** | **2752 × 2064** | Current required primary iPad size |

### Still accepted (legacy, optional)

| Device | Resolution |
|--------|-----------|
| iPhone 6.7" / 6.5" | 1290 × 2796 (6.7") · 1284 × 2778 (6.5") |
| iPad Pro 12.9"     | 2048 × 2732 |

If you only upload 6.9" iPhone screenshots, Apple auto-scales them down for
older device classes that still appear in App Store search results.

**File rules**

- Format: PNG or JPEG
- Color space: RGB — sRGB or P3
- Flattened, **no transparency / no alpha channel**
- Min 1, max 10 per device family per locale
- Max file size: ~500 MB per asset *(uncertain — Apple does not publish a tighter screenshot-specific cap)*

**Sources:** [Apple ASC reference](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/) · [Apple ASC upload guide](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)

---

## 2. Metadata field limits

| Field | Limit | Notes |
|-------|-------|-------|
| App Name | **30** | Highest ranking weight |
| Subtitle | **30** | Second-highest ranking weight |
| Promotional Text | **170** | Editable without resubmission |
| Description | **4,000** | Not indexed for search; conversion-only |
| Keywords field | **100** | Comma-separated, **no spaces** after commas |
| What's New (release notes) | **4,000** | Per release, per locale |
| Privacy Policy URL | n/a | **Mandatory**; ~255 chars practical |
| Support URL | n/a | **Mandatory** |
| Marketing URL | n/a | Optional |

Standard URL fields: Apple does not publish numeric char caps; treat as ~255 practical.

**Sources:** [SplitMetrics ASO description guide](https://splitmetrics.com/blog/app-store-description-guide/) · [App Radar — keyword field](https://appradar.com/academy/ios-keyword-field) · [Apple ASC app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)

---

## 3. ASO indexing behaviour

**Indexed for App Store search** (from highest weight down):

1. App Name
2. Subtitle
3. Keyword Field (comma-separated, no spaces)
4. Primary Category
5. In-App Purchase display names
6. Developer Name

**Not indexed:**

- Description (4,000-char body) — pure conversion text
- Promotional Text — not indexed even though it sits above description

**Subtitle weight** — second only to App Name. Apple combines name +
subtitle + keyword field automatically; **never duplicate words across the
three** — duplicates are deduplicated and waste your ranking surface.

**Screenshot caption text indexing** — *uncertain.* In June 2025 several
ASO tools (Appfigures, AppTweak, App Radar) observed screenshot caption
text influencing search rankings, attributed to OCR. Apple has publicly
denied performing OCR-based indexing. Treat as observed-but-unconfirmed:
write your screenshot captions as if they were keyword-relevant, just don't
keyword-stuff them.

**Sources:** [Apple — App Store search](https://developer.apple.com/app-store/search/) · [SplitMetrics ranking factors](https://splitmetrics.com/blog/apple-app-store-ranking-factors/) · [App Radar — subtitle](https://appradar.com/academy/app-subtitle) · [ConsultMyApp — caption indexing](https://www.consultmyapp.com/blog/-is-apple-now-indexing-screenshot-titles-on-the-app-store) · [Appfigures — algorithm 2025](https://appfigures.com/resources/guides/app-store-algorithm-update-2025)

---

## 4. Product Page Optimization (PPO)

| Setting | Value |
|---------|-------|
| Treatments per test | Up to **3** (plus the original/default) |
| Testable assets | App icon, screenshots, app preview videos |
| **Not** testable | Name, subtitle, description, keywords (text fields are immutable in PPO) |
| Test duration | Up to **90 days** max, or stop manually earlier |
| Traffic split | Developer chooses % allocated; treatments share equally |
| Update required? | Icon tests require an app submission; screenshot/preview tests don't |

No spec changes confirmed for 2025/2026 — treat as still current.

**Sources:** [Apple — PPO overview](https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/overview-of-product-page-optimization/) · [Apple — create a test](https://developer.apple.com/help/app-store-connect/create-product-page-optimization-tests/create-a-test/) · [Apple — PPO marketing page](https://developer.apple.com/app-store/product-page-optimization/)

---

## 5. Custom Product Pages (CPPs)

- **Up to 70 CPPs per app** as of 29 Oct 2025 (raised from 35).
- **Customisable per CPP**: screenshots, app preview videos, promotional text.
- **NOT customisable**: app name, subtitle, description, keywords.
- **URL routing**: append `?ppid=<UUID>` to the App Store product URL. Note: the
  `pt` parameter you may have seen elsewhere is the iTunes provider-token
  affiliate param, **not** CPP routing.
- Since iOS 18, CPPs support per-CPP deep links + keyword assignment so a
  CPP can surface in organic search.

**Sources:** [MobileAction — CPP limit raised](https://www.mobileaction.co/blog/apple-doubles-the-custom-product-page-limit/) · [Apple — configure CPPs](https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions/) · [Adapty — CPPs](https://adapty.io/blog/custom-product-pages-app-store/)

---

## 6. App Preview videos

| Property | Value |
|----------|-------|
| Codec | H.264 or ProRes 422 (HQ) |
| Container | M4V / MP4 / MOV |
| Duration | **15–30 seconds** |
| Max size | ~500 MB per file |
| Quantity | **Up to 3 previews per language per device size** |
| Resolution | Must match the targeted device size's screenshot resolution |
| Content | Authentic in-app footage only — no third-party UI, no calls to action, limited overlays |

**Source:** [Apple — App Preview specs](https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications/)

---

## 7. Localisation

**Per-locale fields:** App Name (30), Subtitle (30), Keywords (100), Promo
Text (170), Description (4,000), What's New (4,000), screenshots, app
previews, in-app event titles/descriptions, subscription display names.
Approximately ~160 indexable chars per locale.

**Fallback rules:** if a locale isn't activated, the App Store falls back
to a related locale (e.g., `fr-CA` → `fr-FR`), and ultimately to the app's
**primary language** as set in App Store Connect.

**New-locale defaults:** when a locale is added to the app, screenshots and
most fields inherit from the primary language **except description and
keywords**, which start blank.

**Sources:** [Apple — localisations](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/) · [Apple — localize app information](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information/)

---

## 8. Recent (2025–2026) compliance gotchas

### Nov 2025 App Review Guidelines update

Tightened rules on copycat apps, misleading branding, and use of other
developers' trademarks. ([9to5Mac](https://9to5mac.com/2025/11/13/apple-tightens-app-review-guidelines-to-crack-down-on-copycat-apps/) · [Apple developer news](https://developer.apple.com/news/?id=d75yllv4))

### Guideline 2.3 (Accurate Metadata) — hard line

Screenshots and videos must reflect the real in-app experience. Showing
fake UI, mock review counts, fabricated star ratings, or features the app
does not have is grounds for rejection AND grounds for **Developer Program
termination** (escalated language since 2021, still in force).

### Anti-manipulation (Guideline 5.6)

Apple prohibits incentivised reviews, fake review counts displayed in
marketing, and any representation of social proof the app cannot
substantiate.

### "Free" / "No Ads" claims

Apple does not publish a specific numbered restriction, but under 2.3.1 /
2.3.7 any such claim must be literally true at listing and review time.

- Free-to-download apps with paid IAPs **cannot** be marketed simply as "Free."
- Apps that show ads in any state **cannot** claim "No Ads."
- Misleading price/feature claims are explicit removal grounds.

*Uncertain on a dedicated rule number; the enforcement basis is the
general accurate-metadata clause.*

### AI-app rules (2025)

AI-generated content must be moderated; AI chat-style apps require
age-gating and content-filter disclosures. ([source](https://openforge.io/app-store-review-guidelines-2025-essential-ai-app-rules/))

**App Review Guidelines:** [developer.apple.com/app-store/review/guidelines/](https://developer.apple.com/app-store/review/guidelines/)

---

## Uncertainties flagged (cross-reference before publishing)

- Exact deprecation date for 6.5"/6.7" screenshot acceptance — not announced
- Screenshot-caption OCR indexing — observed by tools, denied by Apple
- Explicit char limits for URL fields — not numerically published
- Named guideline section for "Free"/"No Ads" claim policing — enforced
  under general 2.3 misleading-metadata clause rather than a dedicated rule
