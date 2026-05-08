// ─── Spec (spec.yaml) ────────────────────────────────────────────────────────

// Layout names. Each maps to a module under src/layouts/.
//
// Portrait layouts (canvas is taller than wide):
//   text-hero               — no phone; bold headline + trust badge + decorative motif
//   caption-below           — phone fills upper canvas; brand mark + caption beneath
//   uppercase-top           — ALL-CAPS title at top; phone full-bleed bottom (may bleed off)
//   logo-tilted             — logo top-left + headline; phone tilted at bottom
//   highlight-pill          — mixed-weight headline with bright pill behind a [bracketed] keyword
//   side-list               — vertical pill list on the left; phone right
//   card-tilted             — white rounded card (caption + badge) overlapping a tilted phone
//   dual-phone-overlap      — two screenshots overlapping at slight opposing rotations
//
// Landscape layouts (canvas is wider than tall — for landscape-native apps):
//   landscape-split         — phone right half, text + features left half
//   landscape-hero          — phone large centre, headline above
//   landscape-text-only     — no-phone CTA closer at landscape (text-hero equivalent)
//
export type Layout =
  // Portrait
  | 'text-hero'
  | 'caption-below'
  | 'uppercase-top'
  | 'logo-tilted'
  | 'highlight-pill'
  | 'side-list'
  | 'card-tilted'
  | 'dual-phone-overlap'
  // Landscape
  | 'landscape-split'
  | 'landscape-hero'
  | 'landscape-text-only';

export type Orientation = 'portrait' | 'landscape';

// Which layouts need a phone screenshot source. text-hero is the only no-phone
// layout. Unknown / legacy layout names fall through here as `false` and are
// rendered using the dispatcher's text-hero fallback rather than being skipped.
export const PHONE_REQUIRED_LAYOUTS: ReadonlySet<Layout> = new Set([
  'caption-below',
  'uppercase-top',
  'logo-tilted',
  'highlight-pill',
  'side-list',
  'card-tilted',
  'dual-phone-overlap',
  'landscape-split',
  'landscape-hero',
]);

export function requiresScreenshot(layout: string): boolean {
  return PHONE_REQUIRED_LAYOUTS.has(layout as Layout);
}

// Story-arc slot a screenshot occupies. Drives which layouts are valid choices.
// Inferred from screenshot order if not declared:  index 0 → value, last → cta,
// middle screenshots alternate usage / trust.
export type StorySlot = 'value' | 'usage' | 'trust' | 'cta';

// Optional second screenshot source — used by `dual-phone-overlap`. When unset
// the layout reuses the primary `sources` for both phones.
export type SecondarySources = Partial<Record<Platform, string>>;

export interface Callout {
  x: number;       // fraction of screenshot width from left
  y: number;       // fraction of screenshot height from top
  width: number;   // fraction of screenshot width
  height: number;  // fraction of screenshot height
}

// Per-screenshot locale override (translated headline/subheadline).
export interface ScreenshotLocaleText {
  headline: string;
  subheadline: string;
}

// Base screenshot record. Layout / headline here are the *fallback* values used
// when a set doesn't override them; sets normally do.
//
// New convention: wrap a keyword in [brackets] inside `headline` to mark it as
// the highlight for the `highlight-pill` layout. Other layouts strip the
// brackets and render the rest as plain text. Example:
//   headline: "Quickly [FIND FEEDS] that match your interests"
export interface ScreenshotSpec {
  id: string;
  slot?: StorySlot;                                      // optional override; otherwise inferred
  layout: Layout;
  /**
   * Orientation of THIS screenshot. When `landscape`, the platform's canvas
   * dimensions are swapped (W↔H) for this screenshot only — supports apps
   * with mixed-orientation screenshot sets (e.g. portrait home + landscape
   * media player). If omitted, orientation is auto-detected from the source
   * screenshot's natural aspect ratio.
   */
  orientation?: Orientation;
  headline: string;
  subheadline: string;
  imagen_prompt?: string;                                // only used when --use-ai-bg is on
  callout?: Callout | null;
  cta_text?: string;
  features?: string[];                                   // category list (side-list); feature bullets (text-hero/card-tilted)
  badge_count?: string;                                  // e.g. "1.9M+" — shown by text-hero, card-tilted
  badge_label?: string;                                  // e.g. "REVIEWS"
  sources: Partial<Record<Platform, string>>;
  sources_secondary?: SecondarySources;                  // dual-phone-overlap second image (optional)
  locales?: Record<string, ScreenshotLocaleText>;        // per-locale headline overrides
}

// ─── Sets / Themes ────────────────────────────────────────────────────────────

// CSS/SVG background style (deterministic, no API calls).
export type BackgroundStyle = 'gradient' | 'mesh' | 'bokeh' | 'geometric' | 'minimal';

// Frame style for the phone mockup.
export type FrameStyle = 'white-border' | 'none';

// One set's theme — fully resolved colors and rendering knobs.
export interface Theme {
  id: string;                       // human-readable label, e.g. "warm-shift"
  palette_name: string;             // e.g. "vivid amber + sky blue"
  primary: string;                  // hex
  secondary: string;                // hex
  accent: string;                   // hex (usually equals primary, but separable)
  bg_from: string;                  // hex — gradient/mesh start
  bg_to: string;                    // hex — gradient/mesh end
  bg_style: BackgroundStyle;
  frame: FrameStyle;
  scrim: number;                    // 0..1 — overlay opacity over background
  phone_top_offset: number;         // fraction of canvas height (split layouts)
  headline_color: string;           // hex or rgba()
  subheadline_color: string;        // hex or rgba()
}

// Per-set per-screenshot override. Allows different layouts and copy framings
// across the matrix while keeping a coherent theme within each set.
export interface SetScreenshotOverride {
  layout?: Layout;
  headline?: string;
  subheadline?: string;
  callout?: Callout | null;
  features?: string[];
  badge_count?: string;
  badge_label?: string;
  // Per-locale overrides for THIS set's screenshot text (rare; falls back to
  // base ScreenshotSpec.locales otherwise).
  locales?: Record<string, ScreenshotLocaleText>;
}

// One row of the A/B/C/D matrix.
export interface SetSpec {
  id: string;                                            // "A", "B", "C", "D" (or any label)
  theme: Theme;
  screenshots: Record<string, SetScreenshotOverride>;    // keyed by ScreenshotSpec.id
}

// ─── Store text ───────────────────────────────────────────────────────────────

export interface GooglePlayText {
  title: string;
  short_description: string;
  full_description: string;
  recent_changes: string;
}

export interface AppStoreText {
  name: string;
  subtitle: string;
  description: string;
  keywords: string;
  promotional_text: string;
}

export interface LocaleText {
  google_play?: GooglePlayText;
  app_store?: AppStoreText;
}

// ASO-strategy block produced by /store-spec. Used to bias AI background
// prompts so the backgrounds reflect what the app actually does (mortgage
// app → subtle home/key motifs; meditation app → calm geometric forms; etc).
export interface AsoStrategy {
  primary_keywords?: string[];
  secondary_keywords?: string[];
  positioning?: string;
  target_audience?: string;
}

export interface Spec {
  version: string;
  aso?: AsoStrategy;                                     // optional but recommended — see /store-spec
  google_play: GooglePlayText;
  app_store: AppStoreText;
  screenshots: ScreenshotSpec[];                         // base / fallback values
  sets?: SetSpec[];                                      // ABCD matrix; optional
  locales?: Record<string, LocaleText>;                  // BCP-47 codes, e.g. "en-US"
}

// ─── Store config (.store-config.yaml) ───────────────────────────────────────

export type ProviderId = 'openai' | 'google';

export interface StoreConfig {
  app: {
    name: string;
    bundle_id: string;
    category: string;
    icon: string;
    platforms: string[];
  };
  brand: {
    primary_color: string;
    secondary_color: string;
    background_gradient_from: string;
    background_gradient_to: string;
    theme_motif: string;
  };
  default_provider?: ProviderId;
  imagen?: {
    model: string;
  };
  openai?: {
    model: string;
    quality?: 'low' | 'medium' | 'high' | 'auto';
  };
}

// ─── Runtime types ────────────────────────────────────────────────────────────

// Platforms = every store-listing asset target. Defaults cover the *required*
// sizes for each store (iPhone 6.9", iPad 13", Android phone, Android 10"
// tablet, Google Play feature graphic). Everything else is opt-in via --include-*.
export type Platform =
  // Default-enabled (required by stores)
  | 'android-phone'         // 1440×2880 — Google Play primary phone
  | 'android-tablet'        // 1600×2560 — Google Play 10" tablet
  | 'ios-phone'             // 1320×2868 — App Store iPhone 6.9" (required)
  | 'ios-tablet-13'         // 2064×2752 — App Store iPad Pro 13" (M4, current required)
  // Opt-in legacy / extended
  | 'ios-phone-6.7'         // 1290×2796 — App Store iPhone 6.7" (legacy)
  | 'ios-phone-6.5'         // 1242×2688 — App Store iPhone 6.5" (legacy)
  | 'ios-tablet'            // 2048×2732 — App Store iPad Pro 12.9" (legacy)
  | 'android-7-tablet'      // 1200×1920 — Google Play 7" tablet
  | 'wear-os'               // 384×384 — Google Play Wear OS
  | 'android-tv-banner';    // 1280×720 — Google Play Android TV banner

export interface PlatformConfig {
  width: number;
  height: number;
  aspectRatio: string;
  outputDir: string;          // relative to output root
  defaultEnabled: boolean;
  fallbackSourceFrom?: Platform;
}

// Resolved render input — what each layout function actually receives.
export interface LayoutInput {
  background: Buffer;                       // pre-rendered background (CSS/SVG or AI)
  screenshotPath: string | null;            // primary screenshot
  screenshotPathSecondary?: string | null;  // dual-phone-overlap optional second
  screenshot: {
    id: string;
    layout: Layout;
    headline: string;
    subheadline: string;
    callout?: Callout | null;
    features?: string[];
    badge_count?: string;
    badge_label?: string;
  };
  theme: Theme;
  config: StoreConfig;
  targetWidth: number;
  targetHeight: number;
  projectRoot: string;                      // for resolving icon paths from config.app.icon
}
