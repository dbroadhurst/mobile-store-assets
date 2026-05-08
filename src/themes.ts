import type { Theme, BackgroundStyle, FrameStyle, StoreConfig } from './types.js';
import {
  shiftHue, saturate, lighten, hexToRgb, colorName,
  pickTextColorsForGradient, ensureAccentContrast,
} from './colors.js';

// Derive N internally-coherent themes from the brand palette. Each theme is a
// concrete render config (palette, background style, frame, scrim, headline
// colors) the matrix planner assigns one-per-set. The first theme is always
// the brand-true baseline so that set A matches the user's brand colors
// without modification.

const BG_STYLES: BackgroundStyle[] = ['gradient', 'mesh', 'bokeh', 'geometric', 'minimal'];
const FRAMES: FrameStyle[] = ['white-border', 'none'];
const SCRIM_TIERS = [0.65, 0.55, 0.45, 0.70];
const PHONE_OFFSETS = [0.30, 0.34, 0.28, 0.32];

interface ThemeRecipe {
  id: string;
  shiftDegrees: number;       // hue rotation applied to brand primary
  satDelta: number;           // saturation shift, -1..1
  lightDelta: number;         // lightness shift, -1..1
}

const RECIPES: ThemeRecipe[] = [
  { id: 'brand-primary',     shiftDegrees:   0, satDelta:  0.00, lightDelta:  0.00 },
  { id: 'warm-shift',        shiftDegrees:  20, satDelta:  0.05, lightDelta:  0.02 },
  { id: 'cool-shift',        shiftDegrees: -20, satDelta:  0.05, lightDelta: -0.02 },
  { id: 'monochrome-accent', shiftDegrees:   0, satDelta: -0.50, lightDelta:  0.00 },
  { id: 'high-contrast',     shiftDegrees:   0, satDelta:  0.20, lightDelta: -0.05 },
  { id: 'muted',             shiftDegrees:  10, satDelta: -0.25, lightDelta:  0.05 },
  { id: 'inverted',          shiftDegrees: 180, satDelta:  0.00, lightDelta:  0.00 },
  { id: 'soft-pastel',       shiftDegrees:  30, satDelta: -0.30, lightDelta:  0.15 },
  // Additional rotations beyond 8 sets reuse hue rotation to keep variety.
];

function recipeAt(index: number): ThemeRecipe {
  if (index < RECIPES.length) return RECIPES[index];
  return {
    id: `rotated-${index}`,
    shiftDegrees: (index * 45) % 360,
    satDelta: 0,
    lightDelta: 0,
  };
}

export function deriveThemes(config: StoreConfig, count: number): Theme[] {
  const brandPrimary  = config.brand.primary_color;
  const brandSecondary = config.brand.secondary_color;

  const themes: Theme[] = [];
  for (let i = 0; i < count; i++) {
    const recipe = recipeAt(i);
    const primary   = applyRecipe(brandPrimary,   recipe);
    const secondary = applyRecipe(brandSecondary, recipe);

    const bg_from = lighten(primary,   -0.20);
    const bg_to   = lighten(secondary, -0.10);
    // Adaptive: pick text colours that contrast against the actual rendered
    // background midpoint. Hardcoded white-on-everything failed against
    // mid-tone teal/green palettes (Set C bokeh in particular).
    const textColors = pickTextColorsForGradient(bg_from, bg_to);
    // Make sure the accent (used for highlight-pill keywords, side-list
    // accents) is readable against the same midpoint.
    const accent = ensureAccentContrast(primary, bg_from, bg_to);

    themes.push({
      id: recipe.id,
      palette_name: `${colorName(hexToRgb(primary))} + ${colorName(hexToRgb(secondary))}`,
      primary,
      secondary,
      accent,
      bg_from,
      bg_to,
      bg_style: BG_STYLES[i % BG_STYLES.length],
      frame:    FRAMES[i % FRAMES.length],
      scrim:    SCRIM_TIERS[i % SCRIM_TIERS.length],
      phone_top_offset: PHONE_OFFSETS[i % PHONE_OFFSETS.length],
      headline_color:    textColors.headline,
      subheadline_color: textColors.subheadline,
    });
  }
  return themes;
}

function applyRecipe(hex: string, r: ThemeRecipe): string {
  let v = hex;
  if (r.shiftDegrees) v = shiftHue(v, r.shiftDegrees);
  if (r.satDelta)     v = saturate(v, r.satDelta);
  if (r.lightDelta)   v = lighten(v, r.lightDelta);
  return v;
}
