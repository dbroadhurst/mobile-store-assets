import type {
  Spec,
  StoreConfig,
  SetSpec,
  Theme,
  ScreenshotSpec,
  SetScreenshotOverride,
  Layout,
} from './types.js';
import { deriveThemes } from './themes.js';
import { inferSlot, layoutForSet } from './story-arc.js';

// Older layout names we used to support — silently migrated so existing specs
// keep working. Two generations of legacy:
//   1. Very old shorthand (cta, hero-center, split-right, etc.)
//   2. The earlier layout family (text-hero, caption-below, etc.) replaced by
//      the container-first system in src/layouts/. See LEGACY_LAYOUT_ALIASES
//      in src/index.ts for the runtime alias map (this file overlaps with
//      that on purpose — both code paths read user-authored spec.yaml).
const LEGACY_LAYOUT_MAP: Record<string, Layout> = {
  // Very old shorthand
  'cta':                'hero-type',
  'hero-center':        'caption-band',
  'split-right':        'caption-band',
  'split-left':         'caption-band',
  'feature-callout':    'tilted-card',
  // Older layout family — superseded names
  'text-hero':          'hero-type',
  'caption-below':      'caption-band',
  'uppercase-top':      'headline-masthead',
  'logo-tilted':        'hero-type',
  'aurora-hero':        'hero-type',
  'bento':              'vertical-bento',
  'editorial-split':    'editorial-card',
  'highlight-pill':     'hero-type',
  'side-list':          'feature-stack',
  'card-tilted':        'tilted-card',
  'dual-phone-overlap': 'dual-phone',
};

function migrateLayout(layout: string | undefined): Layout {
  if (!layout) return 'caption-band';
  if (LEGACY_LAYOUT_MAP[layout]) return LEGACY_LAYOUT_MAP[layout];
  return layout as Layout;
}

// Default A–Z labels. We expose the whole alphabet so --sets up to 26 works.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Resolve the set list for this run.
 *
 *   spec already has sets:[] → use those (skill-authored matrix)
 *   spec has none           → synthesise from base spec + theme derivation
 *
 * Either way, the return value is the fully-resolved per-set per-screenshot
 * render plan. The CLI iterates over this directly.
 */
export function resolveSets(
  spec: Spec,
  config: StoreConfig,
  count: number,
): SetSpec[] {
  const requestedCount = Math.max(1, Math.min(ALPHABET.length, count));

  if (spec.sets && spec.sets.length > 0) {
    // Skill provided the matrix; trust it but clamp to requested count.
    return spec.sets.slice(0, requestedCount);
  }

  // Synthesise. This is the path used when /store-spec hasn't been re-run with
  // --sets, so the user gets a sensible default matrix without re-spec'ing.
  const themes = deriveThemes(config, requestedCount);
  return Array.from({ length: requestedCount }, (_, i) =>
    synthesiseSet(spec, themes[i], i),
  );
}

function synthesiseSet(spec: Spec, theme: Theme, setIndex: number): SetSpec {
  const screenshots: Record<string, SetScreenshotOverride> = {};
  spec.screenshots.forEach((ss, idx) => {
    const slot = inferSlot(spec.screenshots, idx);
    screenshots[ss.id] = {
      // Set 0 keeps the spec's authored layout (migrated if legacy). Later sets
      // rotate through the slot's valid layouts so the matrix shows variety.
      layout: setIndex === 0 ? migrateLayout(ss.layout) : layoutForSet(slot, setIndex),
      // Headlines come from the base spec — synthesised matrix doesn't
      // re-write copy. The skill is the right place to author copy variants;
      // here we focus on layout/theme variety only.
    };
  });
  return {
    id: ALPHABET[setIndex],
    theme,
    screenshots,
  };
}

/**
 * For a (set, base screenshot), produce the resolved render values. Per-set
 * overrides win over base spec values; locale overrides are layered on top
 * by the caller.
 */
export function resolveScreenshot(
  base: ScreenshotSpec,
  set: SetSpec,
): {
  layout: ScreenshotSpec['layout'];
  headline: string;
  subheadline: string;
  callout: ScreenshotSpec['callout'];
  features: ScreenshotSpec['features'];
  badge_count?: string;
  badge_label?: string;
} {
  const ovr = set.screenshots[base.id] ?? {};
  return {
    layout: migrateLayout(ovr.layout ?? base.layout),
    headline: ovr.headline ?? base.headline,
    subheadline: ovr.subheadline ?? base.subheadline,
    callout: ovr.callout ?? base.callout,
    features: ovr.features ?? base.features,
    badge_count: ovr.badge_count ?? base.badge_count,
    badge_label: ovr.badge_label ?? base.badge_label,
  };
}

/** Parse `--sets` argument: count ("4"), label list ("A,B,C"), or empty. */
export function parseSetsArg(raw: string | undefined): { count: number; ids?: string[] } {
  if (!raw) return { count: 4 };
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return { count: parseInt(trimmed, 10) };
  const ids = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  return { count: ids.length, ids };
}
