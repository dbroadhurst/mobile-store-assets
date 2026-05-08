---
name: android-store-requirements
description: >
  Authoritative reference for Google Play Console requirements (May 2026):
  screenshot specs, feature graphic rules, metadata field limits, ASO/NLP
  indexing, store-listing experiments, custom store listings (CSLs), promo
  video, localisation, and recent Play policy compliance. Read this whenever
  you are authoring Android store copy, sizing Google Play assets, or
  advising on experiments / CSLs / ASO. The /store-spec skill consults this
  for every Android field.
---

# Google Play Console — Requirements & ASO Reference

This skill captures the current Play Console rules so `/store-spec` authors
copy and screenshots that pass Play's metadata and content policy. All
facts include source URLs; uncertainties are flagged.

---

## 1. Screenshot specifications

**Format & general rules** (all device types):

- JPEG or 24-bit PNG **without alpha**
- Min **320 px** on shortest side; max **3,840 px** on longest side
- Max aspect ratio **2:1** (longest side cannot exceed 2× shortest)
- Max file size **8 MB** per screenshot

### Orientation — portrait AND landscape both accepted

Google Play accepts portrait, landscape, or mixed orientations within the
same set. For phones the canonical aspects are **9:16 portrait** or
**16:9 landscape**; for tablets, **3:4 portrait** or **4:3 landscape**.

| Surface | Min/Max | Portrait | Landscape | Notes |
|---------|---------|----------|-----------|-------|
| Phone | 2–8 | 9:16 (e.g. 1080×1920, 1440×2880) | 16:9 (e.g. 1920×1080, 2880×1440) | Recommended 1080×1920 |
| 7" tablet | up to 8 | shortest ≥ 1080; e.g. 1200×1920 | 1920×1200 | |
| 10" tablet | up to 8 | 1600×2560 or 2048×2732 | 2560×1600 or 2732×2048 | Both accepted in 2026 |
| Wear OS | ≥ 1 | 384×384 (1:1, no orientation) | n/a | |
| Android TV | ≥ 1 | n/a — TV is landscape-only | 1920×1080 banner / screenshots | |
| Android Auto | n/a | — | — | Not separately required for store-listing visuals |

**Sources:** [App Radar — Play screenshot guidelines](https://appradar.com/blog/android-app-screenshot-sizes-and-guidelines-for-google-play) · [Google — preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)

---

## 2. Feature graphic

- **Exactly 1024 × 500 px**, JPG or 24-bit PNG, **no alpha**
  (transparency renders as black or causes rejection)
- Required if you want a promo video to appear, and for most promotional surfaces

**Restrictions** (will cause ineligibility or removal):

- **No prominent app-icon-style branding** (causes duplication next to the app icon)
- **No "Best", "#1", "Top", "New", "Free", "Discount", "Sale", "Million Downloads"**
- No rankings, testimonials, awards, or price/promo claims
- No fake play-button overlay
- Keep focal content **centred** — there are crop/cutoff zones on different surfaces

**Source:** [ScreenshotWhale — feature graphic spec](https://screenshotwhale.com/feature-graphic-google-play)

---

## 3. Metadata field limits

| Field | Limit | Notes |
|-------|-------|-------|
| Title | **30** chars | Highest ranking weight |
| Short Description | **80** chars | Second highest; shown in search results |
| Full Description | **4,000** chars | Indexed via NLP |
| What's New (release notes) | **500 Unicode chars per language** | Per release |
| Developer Name | ≤ **50** chars | Per Play Console UI; not formally documented as a hard public number — *uncertain* |
| Privacy Policy URL | n/a | Must be active, publicly accessible, non-geofenced, non-PDF; no documented char limit |

**Sources:** [App Tweak — metadata policy 2025](https://www.apptweak.com/en/aso-blog/how-to-prepare-for-new-google-metadata-policy-changes) · [FoxData — short/full description](https://foxdata.com/en/marketing-academy/short-long-descriptions-in-play-store/) · [SplitMetrics — full description](https://splitmetrics.com/blog/google-play-app-description/) · [App Store Manager — release notes](https://docs.appstoremanager.net/documents/release-notes-creation/android-release-notes-creation) · [TermsFeed — privacy policy URL](https://www.termsfeed.com/blog/invalid-privacy-policy-url-google/)

---

## 4. ASO indexing behaviour

Google Play uses semantic indexing + NLP across title, short description,
and full description. **Keyword priority:**

> Title  >  Short Description  >  Full Description

Recommended keyword density still **~2–3%** (≈ one exact match per 250
chars) for top 2–3 terms. Keyword stuffing triggers metadata-policy
rejection and ranking suppression.

The full long description **is** fully indexed (unlike App Store).
**"What's New" is NOT a primary indexing surface** — treat as user-facing
only.

Since 2025 Google rolled out **Guided Search** (AI-organised category
buckets) which weights **stability**, **update cadence** and **retention**
more heavily than pure keyword match.

**Sources:** [MobileAction — ranking factors](https://www.mobileaction.co/blog/google-play-store-ranking-factors/) · [ASO World — 2025 keyword guide](https://asoworld.com/insight/aso-checklist-the-complete-guide-to-google-play-store-keyword-research-in-2025/) · [ASOMobile — ASO 2026](https://asomobile.net/en/blog/aso-in-2026-the-complete-guide-to-app-optimization/)

---

## 5. Store-listing experiments

| Setting | Value |
|---------|-------|
| Concurrent localised experiments | **5** |
| Concurrent default-language experiments | **1** |
| Testable | Text variants (title, short desc, full desc), graphic variants (icon, feature graphic, screenshots, video), or whole custom listings |
| Confidence levels | **90 / 95 / 98 / 99 %** (selectable) |
| Traffic split | Auto-equal between variants |
| Audience | First-time visitors only |

Higher confidence requires more first-time installers — your sample size
budget grows quickly.

**Sources:** [Play Console — experiments](https://play.google.com/console/about/store-listing-experiments/) · [App Radar — A/B testing](https://appradar.com/blog/app-ab-testing-with-store-listing-experiments-in-google-play)

---

## 6. Custom store listings (CSLs)

| Setting | Value |
|---------|-------|
| Max CSLs per app | **50** (Play partners: 100) |
| Targeting types | Country/region, install state (new/inactive/installed), pre-registration, Google Ads campaign, deep-link URL |
| Country exclusivity | Each country can be assigned to only **one** CSL at a time |
| **"Inactive users"** definition (added 2025) | Downloaded > 28 days ago and not opened in last 28 days, or uninstalled |

**Sources:** [Play Console — CSLs](https://play.google.com/console/about/customstorelistings/) · [Phiture — CSL guide](https://phiture.com/asostack/google-play-custom-store-listings/)

---

## 7. Promo video

- **YouTube URL only** — full link, **not** shortened, **not** a playlist or channel
- Must **not** be age-restricted
- **Turn off monetisation** to avoid pre-roll ads on the listing
- Recommended length **30 s – 2 min** (sweet spot 30–60 s); no hard maximum published
- **Landscape required** for game promotional placements
- **Feature graphic required** for the video to display on the listing

**Sources:** [Apptamin — promo video guide](https://www.apptamin.com/promo-video/guide-promo-videos-play-store/) · [App Radar — promo video](https://appradar.com/academy/promo-video) · [Google — YouTube on Play](https://support.google.com/googleplay/android-developer/answer/15501235)

---

## 8. Localisation

- **77 locales supported**
- Default language is set in Play Console
- Users on unsupported locales see the default with an **opt-in auto-translation banner**
- Recent Changes localised separately per language (each subject to the
  500-char limit)

**Sources:** [Google — translate & localize](https://support.google.com/googleplay/android-developer/answer/9844778) · [Google — supported languages](https://support.google.com/googleplay/android-developer/table/4419860) · [OneSky](https://www.onesky.ai/blog/how-to-add-localized-app-description-to-google-play)

---

## 9. Policy changes 2025-2026 affecting copy

### Metadata policy (clarified 2025) — banned in title, icon, developer name

- Words: "free", "best", "top", "#1", "sale", "no ads", "ad free", "download now", "update"
- Emojis, repeated punctuation, ALL CAPS (unless part of a registered brand)
- Store-performance / ranking claims, price/promo callouts
- References to other Play programs

### Health Content & Services policy (effective 28 Aug 2025)

- Bans misleading health claims
- Requires regulatory proof or disclaimer for medical functionality
- Mandates Health apps declaration form + privacy policy

### Financial features declaration

Now mandatory for **every app** (even non-financial) — updates blocked
until completed.

### Misleading Claims policy

Clarified to cover medical, health, and government-services
disinformation.

### Region-relevant pricing (March 2025)

Pricing shown in screenshots/video must be reflected accurately for the
target region.

### Hardware dependencies

External hardware dependencies must be disclosed in description.

### Ads disclosure

No specific *new* 2025/26 listing-copy rule beyond the longstanding
"Contains ads" badge driven by the Ads declaration. No fresh
"as seen in" / fake-social-proof carve-out — these still fall under
**Misleading Claims**.

**Sources:** [App Tweak — metadata policy 2025](https://www.apptweak.com/en/aso-blog/how-to-prepare-for-new-google-metadata-policy-changes) · [MyAppMonitor — health policy update](https://myappmonitor.com/blog/google-play-policy-update-for-health-apps) · [ASOWorld — Oct 2025 updates](https://asoworld.com/blog/october-2025-google-play-policy-updates-key-changes-for-child-safety-finance-health-compliance/) · [Google Developer Program Policy](https://support.google.com/googleplay/android-developer/answer/16933379)

---

## Uncertainties flagged (cross-reference before publishing)

- **Developer name length** — widely cited as 50 chars but not stated
  explicitly in the current public Metadata help page. Verify in-Console.
- **Privacy policy URL char limit** — no documented number found.
- **10" tablet "current" recommended size** — Google's help page lists
  ranges, not a single canonical size; both 1600×2560 and 2048×2732 are
  accepted in 2026.
- **Promo video hard maximum length** — Google does not publish one.

---

## Authoritative sources (Google primary, plus secondary)

**Google official:**

- [Add preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)
- [Translate & localize](https://support.google.com/googleplay/android-developer/answer/9844778)
- [Supported languages](https://support.google.com/googleplay/android-developer/table/4419860)
- [Custom store listings](https://support.google.com/googleplay/android-developer/answer/9867158)
- [Store-listing experiments](https://play.google.com/console/about/store-listing-experiments/)
- [YouTube videos on Play](https://support.google.com/googleplay/android-developer/answer/15501235)
- [Health Content & Services policy](https://support.google.com/googleplay/android-developer/answer/16679511)
- [Developer Program Policy](https://support.google.com/googleplay/android-developer/answer/16933379)

**Reputable secondary references** used inline above: AppRadar, Apptweak,
Apptamin, MobileAction, Phiture, ScreenshotWhale, ASOWorld, SplitMetrics,
FoxData, Gummicube, TermsFeed.
