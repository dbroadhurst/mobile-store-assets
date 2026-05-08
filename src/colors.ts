import sharp from 'sharp';

// ─── Color extraction ─────────────────────────────────────────────────────────
// Samples dominant colors from a source screenshot. Designed for app UI: skips
// near-black and near-white (chrome, backgrounds) and weights saturated pixels
// higher, since brand colors on screen are usually the most saturated region.

export interface RGB { r: number; g: number; b: number; }

export interface ExtractedTheme {
  primary: RGB;
  secondary: RGB;
  primaryHex: string;
  secondaryHex: string;
  primaryName: string;
  secondaryName: string;
}

const SAMPLE_SIZE = 64;
const BUCKET_BITS = 4;
const MIN_DISTANCE = 200;

export async function extractTheme(imagePath: string): Promise<ExtractedTheme> {
  const { data } = await sharp(imagePath)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  type Bucket = { count: number; rSum: number; gSum: number; bSum: number };
  const buckets = new Map<number, Bucket>();

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 30 || min > 230) continue;

    const sat = max > 0 ? (max - min) / max : 0;
    if (sat < 0.10) continue;

    const key =
      ((r >> (8 - BUCKET_BITS)) << (BUCKET_BITS * 2)) |
      ((g >> (8 - BUCKET_BITS)) << BUCKET_BITS) |
      (b >> (8 - BUCKET_BITS));

    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
    } else {
      buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
  }

  if (buckets.size === 0) {
    const fallback = { r: 80, g: 120, b: 160 };
    return makeTheme(fallback, { r: 30, g: 40, b: 60 });
  }

  const ranked = [...buckets.values()]
    .map(({ count, rSum, gSum, bSum }) => {
      const r = Math.round(rSum / count);
      const g = Math.round(gSum / count);
      const b = Math.round(bSum / count);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;
      return { r, g, b, score: count * (1 + sat * 2) };
    })
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0];
  const secondary =
    ranked.find(c => l1(c, primary) > MIN_DISTANCE) ?? ranked[1] ?? primary;

  return makeTheme(primary, secondary);
}

function l1(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function makeTheme(p: RGB, s: RGB): ExtractedTheme {
  return {
    primary: p,
    secondary: s,
    primaryHex: rgbToHex(p),
    secondaryHex: rgbToHex(s),
    primaryName: colorName(p),
    secondaryName: colorName(s),
  };
}

// ─── Hex / RGB conversion ─────────────────────────────────────────────────────

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  const m = hex.replace('#', '').trim();
  const v = m.length === 3
    ? m.split('').map(c => parseInt(c + c, 16))
    : [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16));
  return { r: v[0] || 0, g: v[1] || 0, b: v[2] || 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── HSL conversion + manipulation ────────────────────────────────────────────

export interface HSL { h: number; s: number; l: number; }

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1)      { r1 = c; g1 = x; }
  else if (hh < 2) { r1 = x; g1 = c; }
  else if (hh < 3) { g1 = c; b1 = x; }
  else if (hh < 4) { g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; b1 = c; }
  else             { r1 = c; b1 = x; }
  const m = l - c / 2;
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}

// Rotate hue by `degrees` (positive = warmer toward red, negative = cooler).
export function shiftHue(hex: string, degrees: number): string {
  const hsl = rgbToHsl(...Object.values(hexToRgb(hex)) as [number, number, number]);
  return rgbToHex(hslToRgb({ h: hsl.h + degrees, s: hsl.s, l: hsl.l }));
}

// Adjust saturation by delta (-1..1). saturate('#3B7AC1', -0.5) desaturates 50%.
export function saturate(hex: string, delta: number): string {
  const hsl = rgbToHsl(...Object.values(hexToRgb(hex)) as [number, number, number]);
  return rgbToHex(hslToRgb({ h: hsl.h, s: clamp(hsl.s + delta, 0, 1), l: hsl.l }));
}

// Adjust lightness by delta (-1..1).
export function lighten(hex: string, delta: number): string {
  const hsl = rgbToHsl(...Object.values(hexToRgb(hex)) as [number, number, number]);
  return rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: clamp(hsl.l + delta, 0, 1) }));
}

// ─── WCAG contrast & adaptive text colour ────────────────────────────────────
//
// Rendering white text on a mid-luminance background (e.g. light teal-green)
// fails WCAG AA contrast — readers strain to parse it. These helpers pick a
// text colour that meets contrast against the average rendered background.

function srgbLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance (0..1). */
export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * srgbLinear(r) + 0.7152 * srgbLinear(g) + 0.0722 * srgbLinear(b);
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Average two hex colours (used to estimate gradient mid-tone). */
export function averageHex(a: string, b: string): RGB {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  return { r: (ra.r + rb.r) / 2, g: (ra.g + rb.g) / 2, b: (ra.b + rb.b) / 2 };
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 26, g: 26, b: 26 };  // soft black, easier on eyes than #000

/**
 * Pick a high-contrast text colour for a given background. Returns hex.
 * When the background's luminance is high enough that white text would
 * fall below WCAG AA (< 4.5), returns a dark colour; otherwise white.
 */
export function pickTextColor(bgHex: string): string {
  const bg = hexToRgb(bgHex);
  const whiteContrast = contrastRatio(bg, WHITE);
  const blackContrast = contrastRatio(bg, BLACK);
  return whiteContrast >= blackContrast ? rgbToHex(WHITE) : rgbToHex(BLACK);
}

/**
 * Pick text + subhead colours for a gradient background. Uses the gradient
 * midpoint to estimate the tonal value behind text.
 */
export function pickTextColorsForGradient(bgFromHex: string, bgToHex: string): {
  headline: string; subheadline: string;
} {
  const mid = averageHex(bgFromHex, bgToHex);
  const wc = contrastRatio(mid, WHITE);
  const bc = contrastRatio(mid, BLACK);
  if (wc >= bc) {
    return { headline: '#FFFFFF', subheadline: 'rgba(255,255,255,0.88)' };
  }
  return { headline: rgbToHex(BLACK), subheadline: 'rgba(26,26,26,0.78)' };
}

/**
 * Boost an accent colour so it has enough contrast against the background.
 * If the accent already passes 4.5:1 against the bg midpoint, returned
 * unchanged. Otherwise darkened or lightened until it does (or until 21).
 */
export function ensureAccentContrast(accentHex: string, bgFromHex: string, bgToHex: string): string {
  const mid = averageHex(bgFromHex, bgToHex);
  let cur = hexToRgb(accentHex);
  let cr = contrastRatio(cur, mid);
  if (cr >= 4.5) return accentHex;

  // If background is dark, lighten the accent. If light, darken.
  const bgLum = relativeLuminance(mid);
  const direction = bgLum > 0.5 ? -1 : 1; // -1 = darker, 1 = lighter
  const hsl = rgbToHsl(cur.r, cur.g, cur.b);
  for (let step = 1; step <= 12; step++) {
    const newL = clamp(hsl.l + direction * 0.06 * step, 0, 1);
    const next = hslToRgb({ h: hsl.h, s: hsl.s, l: newL });
    if (contrastRatio(next, mid) >= 4.5) return rgbToHex(next);
    cur = next;
  }
  return rgbToHex(cur);
}

// ─── Color naming ─────────────────────────────────────────────────────────────

export function colorName({ r, g, b }: RGB): string {
  const { h, s, l } = rgbToHsl(r, g, b);

  if (l < 0.10) return 'deep charcoal';
  if (l > 0.94 && s < 0.10) return 'soft off-white';
  if (s < 0.12) {
    if (l < 0.30) return 'dark slate grey';
    if (l > 0.70) return 'light grey';
    return 'mid grey';
  }

  const lightness = l < 0.32 ? 'deep ' : l > 0.72 ? 'pale ' : '';
  const intensity = s > 0.70 && l > 0.30 && l < 0.70 ? 'vivid ' : '';

  let hue: string;
  if (h < 15)       hue = 'red';
  else if (h < 35)  hue = 'orange';
  else if (h < 55)  hue = 'amber';
  else if (h < 75)  hue = 'yellow';
  else if (h < 100) hue = 'lime green';
  else if (h < 150) hue = 'green';
  else if (h < 175) hue = 'teal';
  else if (h < 195) hue = 'cyan';
  else if (h < 220) hue = 'sky blue';
  else if (h < 250) hue = 'blue';
  else if (h < 275) hue = 'indigo';
  else if (h < 295) hue = 'violet';
  else if (h < 320) hue = 'magenta';
  else if (h < 345) hue = 'pink';
  else              hue = 'red';

  return `${lightness}${intensity}${hue}`.trim();
}
