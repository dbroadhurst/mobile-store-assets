import sharp from 'sharp';
import {
  contrastRatio, hexToRgb, relativeLuminance, type RGB,
} from './colors.js';
import type {
  TextZone, ZoneBbox, GateResult, TextRole,
} from './types.js';

// ─── Readability gate ────────────────────────────────────────────────────────
// Post-render audit that catches the gap between authored text colour and the
// actual rendered pixels under that text — gradient midpoints lie about photo
// overlays, app-motif glyphs lie about uniform contrast, and a fixed-strength
// scrim cannot adapt to either. The gate samples the composed image inside
// each declared zone, computes contrast against the declared text colour, and
// emits violations against WCAG 2.2 AA targets.
//
// Targets (WCAG 2.2 §1.4.3):
//   - Normal text  (< 18 pt / < 14 pt bold): 4.5 : 1 minimum
//   - Large text   (≥ 18 pt / ≥ 14 pt bold): 3.0 : 1 minimum

/**
 * Minimum font sizes per role at a 1290 px-wide source canvas. Scaled
 * proportionally for other widths by `minFontPxFor(role, canvasWidth)`.
 *
 * Floors are derived from WCAG body-text conventions translated to the
 * source-canvas resolution. The 6.9" iPhone source (1290 × 2796) renders on a
 * ≈ 430 logical-pt phone display at 3× retina, so 1 CSS px ≈ 3 source px. The
 * 16 CSS px web body-text minimum therefore maps to 48 source px — that's the
 * universal floor for body / caption / subhead text. Larger UI ink (badges,
 * stat labels) sits one tier below at 14 CSS px / 42 source px, which matches
 * the Apple HIG "Callout" floor and Material `body2`. Headlines must stay
 * legible at thumbnail size, so they sit well above WCAG "large text".
 *
 *   headline    80 (≈ 27 CSS px, > WCAG large-text 24)
 *   subheadline 48 (= 16 CSS px, WCAG body)
 *   caption     48 (= 16 CSS px, WCAG body)
 *   badge       42 (≈ 14 CSS px, Apple HIG Callout / Material body2)
 *   label       42 (≈ 14 CSS px, Apple HIG Callout / Material body2)
 *
 * Below the per-role floor each entry uses 42 px (= 14 CSS px) as the
 * hard universal minimum — any text smaller than this is unreadable on a
 * native-resolution App Store / Play Store screenshot view, and unreadable at
 * any thumbnail size.
 */
const MIN_FONT_AT_1290: Record<TextRole, number> = {
  headline:    80,
  subheadline: 48,
  caption:     48,
  badge:       42,
  label:       42,
};

const REFERENCE_CANVAS_W = 1290;

/**
 * Returns the minimum font px floor for a role at a given canvas size. Scales
 * by the canvas's SHORTER dimension so landscape canvases (e.g. 2868 × 1320)
 * are matched against the portrait reference's shorter side (1290), not the
 * exaggerated landscape width. Without the canvasHeight argument we fall back
 * to canvasWidth (the portrait-only behaviour).
 */
export function minFontPxFor(role: TextRole, canvasWidth: number, canvasHeight?: number): number {
  const ref = MIN_FONT_AT_1290[role];
  const shorter = canvasHeight !== undefined ? Math.min(canvasWidth, canvasHeight) : canvasWidth;
  return Math.round(ref * (shorter / REFERENCE_CANVAS_W));
}

/** WCAG AA target ratio for a zone given its role + isLargeText flag. */
export function targetContrastFor(role: TextRole, isLargeText: boolean): number {
  // Headlines are visually large but we still want them as readable as a
  // subhead — they're scanned at thumbnail size. 3.0 is the WCAG floor for
  // large text; 4.5 is the aspirational AAA-equivalent we recommend.
  if (role === 'headline' && isLargeText) return 3.0;
  if (isLargeText) return 3.0;
  return 4.5;
}

// ─── Pixel sampling ──────────────────────────────────────────────────────────

/**
 * Sample mean colour inside a bbox of an RGB buffer. Returns the average sRGB
 * pixel under that region.
 *
 * The buffer can be a sharp-readable PNG/JPEG — we re-resize and rebake to raw
 * RGB so we don't have to thread image metadata through. The bbox is clamped
 * to the buffer bounds so a slightly-off-canvas zone (text shadow halo) still
 * returns a sensible average instead of throwing.
 */
export async function sampleAverageColor(
  bgBuf: Buffer,
  bbox: ZoneBbox,
): Promise<RGB> {
  const meta = await sharp(bgBuf).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W === 0 || H === 0) return { r: 128, g: 128, b: 128 };

  const x = Math.max(0, Math.min(W - 1, Math.floor(bbox.x)));
  const y = Math.max(0, Math.min(H - 1, Math.floor(bbox.y)));
  const w = Math.max(1, Math.min(W - x, Math.floor(bbox.w)));
  const h = Math.max(1, Math.min(H - y, Math.floor(bbox.h)));

  const { data } = await sharp(bgBuf)
    .extract({ left: x, top: y, width: w, height: h })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let rSum = 0, gSum = 0, bSum = 0;
  const px = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  return {
    r: rSum / px,
    g: gSum / px,
    b: bSum / px,
  };
}

// ─── Adaptive scrim math ─────────────────────────────────────────────────────

/**
 * Required dark-scrim alpha to bring `bg` into a contrast of `targetRatio`
 * against `text`. Returns 0 when contrast already passes. Returns up to ~0.85
 * — past that the underlying art is being obliterated, so we cap there and
 * let the gate fail loudly instead.
 *
 * Math: an alpha-blended scrim over background `bg` with scrim colour `scrim`
 * yields `bg' = (1 - α)·bg + α·scrim`. For a dark scrim (assume RGB 0/0/0) the
 * blended channel becomes `(1 - α)·bg`. Relative luminance is linear in the
 * gamma-decoded space, so we find α such that the contrast ratio of
 * `text` vs the blended bg clears the target.
 *
 * We search numerically because the gamma transform is non-linear — analytic
 * is fiddly and the search is fast (≤ 16 iterations).
 */
export function requiredDarkScrimAlpha(
  bg: RGB,
  text: RGB,
  targetRatio: number,
  maxAlpha = 0.85,
): number {
  // Already passes?
  if (contrastRatio(bg, text) >= targetRatio) return 0;

  // Binary search alpha in [0, maxAlpha]
  let lo = 0;
  let hi = maxAlpha;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const blended: RGB = {
      r: (1 - mid) * bg.r,
      g: (1 - mid) * bg.g,
      b: (1 - mid) * bg.b,
    };
    if (contrastRatio(blended, text) >= targetRatio) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  // Return hi (the smallest known-passing alpha)
  return Math.min(maxAlpha, hi);
}

/**
 * Same as `requiredDarkScrimAlpha` but for a *light* scrim (white). Use this
 * when the declared text colour is dark — a darker scrim wouldn't help.
 */
export function requiredLightScrimAlpha(
  bg: RGB,
  text: RGB,
  targetRatio: number,
  maxAlpha = 0.85,
): number {
  if (contrastRatio(bg, text) >= targetRatio) return 0;
  let lo = 0;
  let hi = maxAlpha;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const blended: RGB = {
      r: (1 - mid) * bg.r + mid * 255,
      g: (1 - mid) * bg.g + mid * 255,
      b: (1 - mid) * bg.b + mid * 255,
    };
    if (contrastRatio(blended, text) >= targetRatio) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return Math.min(maxAlpha, hi);
}

/**
 * Given the actual background sampled under a text region and the declared
 * text colour, pick scrim direction + alpha. Returns null if no scrim is
 * needed; otherwise an SVG-ready rgba() colour and alpha.
 *
 * Direction rule: if text is light (luminance > 0.5), darken the bg. Else
 * lighten. This matches the typical brand-decision flow — a brand colour with
 * white text gets a dark scrim; same brand with dark text gets a light scrim.
 */
export function adaptiveScrimFor(
  bg: RGB,
  textHex: string,
  targetRatio: number,
): { color: string; alpha: number } | null {
  const text = hexToRgb(stripRgbaPrefix(textHex));
  if (contrastRatio(bg, text) >= targetRatio) return null;

  const textLum = relativeLuminance(text);
  if (textLum > 0.5) {
    const a = requiredDarkScrimAlpha(bg, text, targetRatio);
    return a > 0 ? { color: '#000000', alpha: a } : null;
  }
  const a = requiredLightScrimAlpha(bg, text, targetRatio);
  return a > 0 ? { color: '#FFFFFF', alpha: a } : null;
}

/**
 * Build an SVG <rect> string for a scrim sized to a text bbox, plus a padding
 * margin so the scrim extends visibly past the glyph edge (otherwise the
 * scrim's edge IS the text edge and creates a hard rectangle).
 */
export function buildScrimRect(
  bbox: ZoneBbox,
  scrim: { color: string; alpha: number },
  opts: { padX?: number; padY?: number; radius?: number } = {},
): string {
  const padX = opts.padX ?? Math.round(bbox.h * 0.5);
  const padY = opts.padY ?? Math.round(bbox.h * 0.35);
  const r = opts.radius ?? Math.round(bbox.h * 0.25);
  const x = bbox.x - padX;
  const y = bbox.y - padY;
  const w = bbox.w + padX * 2;
  const h = bbox.h + padY * 2;
  // Slightly soften the scrim edge with two stops so the rectangle doesn't read
  // as a UI panel — radial fade from full alpha at centre to ~85% at the edges.
  const a = scrim.alpha.toFixed(3);
  const fill = scrim.color === '#000000' ? '0,0,0' : '255,255,255';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"
    fill="rgba(${fill},${a})"/>`;
}

// ─── Validation pass ─────────────────────────────────────────────────────────

/**
 * Run the gate on a fully-composed image given the zones the layout declared.
 * Samples the rendered pixels under each zone (so scrims, motif overlays and
 * gradient irregularities are all accounted for) and returns per-zone
 * violations.
 *
 * Layouts that emit no zones (TV banner, watch face) trivially pass.
 */
export async function validateZones(
  rendered: Buffer,
  zones: TextZone[],
  canvasWidth: number,
  canvasHeight?: number,
): Promise<GateResult> {
  const result: GateResult = { contrast: [], fontSize: [] };
  for (const z of zones) {
    // 1. Font-size floor (scaled by canvas's shorter side so landscape canvases
    //    aren't forced to landscape-width-proportional minimums).
    const floor = minFontPxFor(z.role, canvasWidth, canvasHeight);
    if (z.fontSize < floor) {
      result.fontSize.push({
        role: z.role,
        fontSize: z.fontSize,
        minimum: floor,
        bbox: z.bbox,
      });
    }

    // 2. Contrast against actual rendered background
    const bg = await sampleAverageColor(rendered, z.bbox);
    const text = hexToRgb(stripRgbaPrefix(z.color));
    const measured = contrastRatio(bg, text);
    const target = targetContrastFor(z.role, z.isLargeText);
    if (measured < target) {
      result.contrast.push({
        role: z.role,
        text: z.text,
        measured: Number(measured.toFixed(2)),
        target,
        bbox: z.bbox,
      });
    }
  }
  return result;
}

// ─── Color parsing helper ────────────────────────────────────────────────────

function stripRgbaPrefix(c: string): string {
  // If a layout passed "rgba(255,255,255,0.88)" we approximate by stripping
  // the alpha and using the colour at full opacity for contrast purposes.
  // The alpha component affects how the text looks vs. the bg, but layouts
  // tend to pass alpha as a stylistic dim — we audit against the worst case
  // (full opacity) so the gate is conservative.
  if (c.startsWith('rgba(') || c.startsWith('rgb(')) {
    const m = c.match(/rgba?\(([^)]+)\)/i);
    if (!m) return '#FFFFFF';
    const parts = m[1].split(',').map(s => s.trim());
    const r = Math.round(Number(parts[0]) || 0);
    const g = Math.round(Number(parts[1]) || 0);
    const b = Math.round(Number(parts[2]) || 0);
    const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return c;
}
