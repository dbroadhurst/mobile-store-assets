import type { Platform, PlatformConfig } from './types.js';

// Platform definitions. `defaultEnabled: true` means the platform is part of
// the default render set (required by the stores). Everything else is opt-in
// via --include-<name> CLI flags or via --include-all.
//
// Sources of truth:
//   ios-store-requirements      — § Screenshot specifications
//   android-store-requirements  — § Screenshot specifications
//
// `fallbackSourceFrom` lets a platform reuse another platform's source
// screenshot if the user hasn't supplied a dedicated one (sharp resizes
// + center-crops to fit). Saves users from exporting every screenshot at
// every legacy resolution.
export const PLATFORMS: Record<Platform, PlatformConfig> = {
  // ── Default-enabled (current store-required sizes) ────────────────────────
  'android-phone': {
    width: 1440, height: 2880,
    aspectRatio: '9:16',
    outputDir: 'google-play/phone',
    defaultEnabled: true,
  },
  'android-tablet': {
    width: 1600, height: 2560,
    aspectRatio: '3:4',
    outputDir: 'google-play/tablet',
    defaultEnabled: true,
  },
  'ios-phone': {
    width: 1320, height: 2868,
    aspectRatio: '9:16',
    outputDir: 'app-store/iphone-6.9',
    defaultEnabled: true,
  },
  'ios-tablet-13': {
    width: 2064, height: 2752,
    aspectRatio: '3:4',
    outputDir: 'app-store/ipad-pro-13',
    defaultEnabled: true,
    // 12.9" sources (2048×2732) upscale ~1% — visually identical
    fallbackSourceFrom: 'ios-tablet',
  },

  // ── Opt-in legacy iOS sizes ───────────────────────────────────────────────
  'ios-phone-6.7': {
    width: 1290, height: 2796,
    aspectRatio: '9:16',
    outputDir: 'app-store/iphone-6.7',
    defaultEnabled: false,
    fallbackSourceFrom: 'ios-phone',
  },
  'ios-phone-6.5': {
    width: 1242, height: 2688,
    aspectRatio: '9:16',
    outputDir: 'app-store/iphone-6.5',
    defaultEnabled: false,
    fallbackSourceFrom: 'ios-phone',
  },
  'ios-tablet': {
    width: 2048, height: 2732,
    aspectRatio: '3:4',
    outputDir: 'app-store/ipad-pro-12.9',
    // Now legacy — current required is 13" (ios-tablet-13). Kept default-enabled
    // for backwards compatibility with existing specs that have ios-tablet
    // sources; can be omitted with explicit --platform list.
    defaultEnabled: true,
  },

  // ── Opt-in extended Android surfaces ──────────────────────────────────────
  'android-7-tablet': {
    width: 1200, height: 1920,
    aspectRatio: '5:8',
    outputDir: 'google-play/tablet-7',
    defaultEnabled: false,
    fallbackSourceFrom: 'android-tablet',
  },
  'wear-os': {
    width: 384, height: 384,
    aspectRatio: '1:1',
    outputDir: 'google-play/wear-os',
    defaultEnabled: false,
    // No screenshot fallback — Wear OS uses its own simplified composition
    // (icon + short title) rendered without a source phone.
  },
  'android-tv-banner': {
    width: 1280, height: 720,
    aspectRatio: '16:9',
    outputDir: 'google-play/tv-banner',
    defaultEnabled: false,
    // No screenshot fallback — banner is composed from icon + app name only
  },
};

export const FEATURE_GRAPHIC = { width: 1024, height: 500 };

export const DEFAULT_LOCALE = 'default';

// Opt-in platform mapping for --include-* flags
export const INCLUDE_FLAG_MAP: Record<string, Platform[]> = {
  '13':         ['ios-tablet-13'],   // already default; kept for explicitness
  '6.7':        ['ios-phone-6.7'],
  '6.5':        ['ios-phone-6.5'],
  '12.9':       ['ios-tablet'],
  '7-tablet':   ['android-7-tablet'],
  'wear':       ['wear-os'],
  'wear-os':    ['wear-os'],
  'tv-banner':  ['android-tv-banner'],
  'tv':         ['android-tv-banner'],
};
