import type { Layout, StorySlot, ScreenshotSpec, Orientation } from './types.js';

// Story-arc mechanics:
//
//   slot 0          → value   (the promise — what do I get?)
//   slot 1          → usage   (how does it work? hero feature)
//   slot 2..N-2     → trust   (differentiation, credibility)
//   final slot      → cta     (no phone — pure brand image)
//
// Each slot declares a list of valid layouts in preference order. The matrix
// planner picks index N for set N (wrapping when N exceeds the list length).
//
// Two parallel tables exist — portrait and landscape — because layouts
// designed for tall canvases (text-on-top + phone-on-bottom) don't translate
// to wide canvases. The renderer picks the right table based on the
// screenshot's orientation field (or auto-detected aspect).

export const VALID_LAYOUTS_PORTRAIT: Record<StorySlot, Layout[]> = {
  value: ['uppercase-top', 'aurora-hero', 'highlight-pill', 'caption-below'],
  usage: ['caption-below', 'card-tilted', 'dual-phone-overlap', 'bento'],
  trust: ['editorial-split', 'dual-phone-overlap', 'side-list', 'highlight-pill'],
  cta:   ['text-hero'],
};

export const VALID_LAYOUTS_LANDSCAPE: Record<StorySlot, Layout[]> = {
  // Landscape canvases only have a couple of usable compositions today.
  // Sets rotate through them and wrap when N > list length.
  value: ['landscape-hero', 'landscape-split'],
  usage: ['landscape-split', 'landscape-hero'],
  trust: ['landscape-split', 'landscape-hero'],
  cta:   ['landscape-text-only'],
};

// Back-compat alias — older code (not yet aware of landscape) used this name.
export const VALID_LAYOUTS = VALID_LAYOUTS_PORTRAIT;

export function inferSlot(screenshots: ScreenshotSpec[], index: number): StorySlot {
  const ss = screenshots[index];
  if (ss.slot) return ss.slot;

  // text-hero is the no-phone closer.
  if (ss.layout === 'text-hero') return 'cta';
  if (index === screenshots.length - 1 && Object.keys(ss.sources ?? {}).length === 0) return 'cta';

  if (index === 0) return 'value';
  if (index === 1) return 'usage';
  return 'trust';
}

export function layoutForSet(
  slot: StorySlot,
  setIndex: number,
  orientation: Orientation = 'portrait',
): Layout {
  const table = orientation === 'landscape' ? VALID_LAYOUTS_LANDSCAPE : VALID_LAYOUTS_PORTRAIT;
  const valid = table[slot];
  return valid[setIndex % valid.length];
}
