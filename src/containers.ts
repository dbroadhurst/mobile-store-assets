import { sampleAverageColor, requiredDarkScrimAlpha, requiredLightScrimAlpha, targetContrastFor } from './contrast-gate.js';
import { hexToRgb, contrastRatio, relativeLuminance, type RGB } from './colors.js';
import { escapeXml } from './helpers.js';
import type { TextRole, TextZone, ZoneBbox } from './types.js';

// ─── Container-first composition ───────────────────────────────────────────
// Every text run in a layout sits on a deterministic container whose alpha
// is solved against the actual sampled background pixels. Three styles cover
// every layout in design/layouts-*.html:
//
//   solid-panel   rounded rect, alpha 0.74–0.84, drop shadow — hero headlines
//   soft-band     full-width band, alpha 0.45–0.60, feathered edge — captions
//   chip          near-opaque pill, alpha 0.92–0.98 — badges, feature claims
//
// The planner merges adjacent zones (overlap or within 0.6 × line-height) into
// one container so a headline and subhead sit on one panel, not two stacked
// rectangles. The painter emits the SVG `<rect>`s for the container(s) and the
// `<text>` elements together, with alpha computed at render time per merged
// group.

export type ContainerStyle = 'solid-panel' | 'soft-band' | 'chip';

/**
 * A zone the layout wants painted on a container. Same fields as TextZone but
 * with an extra `style` field declaring which container type to use. Most
 * zones don't need explicit container coordinates — the planner expands the
 * text bbox by role-aware padding to derive the rect.
 */
export interface ContainerZone extends TextZone {
  style: ContainerStyle;
  /** Anchor for the text element. Defaults to 'start'. */
  anchor?: 'start' | 'middle' | 'end';
  /** Baseline X for text (defaults to bbox.x for start, bbox center for middle). */
  textX?: number;
  /** Baseline Y for text (defaults to bbox.y + bbox.h × 0.78). */
  textY?: number;
  /** Override the container's fill colour (default chosen by style + scrim direction). */
  fillOverride?: string;
  /** Override the container's alpha (default computed from sampled bg). */
  alphaOverride?: number;
  /** Font weight (defaults to 800 for headline, 600 for badge/chip, 400 elsewhere). */
  fontWeight?: number;
  /** Optional CSS letter-spacing for the text element. */
  letterSpacing?: number;
}

/**
 * Padding around the text bbox for each container style. The container's
 * actual rect = expand(textBbox, padding).
 */
const PADDING: Record<ContainerStyle, { x: number; y: number; radius: number }> = {
  'solid-panel': { x: 28, y: 22, radius: 18 },
  'soft-band':   { x: 0,  y: 28, radius: 0  },   // full-width band; ignored for x
  'chip':        { x: 16, y: 8,  radius: 999 }, // pill shape
};

/** Target alpha ranges per style (we clamp the solved alpha into these bounds). */
export const ALPHA_BOUNDS: Record<ContainerStyle, { min: number; max: number }> = {
  'solid-panel': { min: 0.74, max: 0.86 },
  'soft-band':   { min: 0.45, max: 0.60 },
  'chip':        { min: 0.92, max: 0.98 },
};

// ─── Design-driven panel API ────────────────────────────────────────────────
// Layouts that match the design HTML pixel-for-pixel use this. The layout
// declares an EXPLICIT panel rect (from design-coordinate proportions); we
// solve the alpha against actual sampled bg pixels and return both the
// computed alpha and the scrim direction (light → dark scrim; dark → light
// scrim) so the layout can pick the right fill colour.

/** Text element that will sit inside a panel — used to size required alpha. */
export interface PanelText {
  color: string;          // hex or rgba()
  isLargeText: boolean;
}

/**
 * Solve the minimum alpha needed under an explicit panel rect so every
 * provided text element clears WCAG AA contrast against the actual bg
 * sampled under that rect. Returns alpha + scrim direction so the layout
 * picks the matching panel fill (dark scrim = #0A0F1F, light scrim = #FFFFFF).
 *
 * `contrastBoost` is the auto-remediation knob from index.ts retry loop —
 * 0 on the first attempt, +1.0 per retry up to MAX_GATE_RETRIES.
 */
export async function solvePanelAlpha(
  bgBuf: Buffer,
  bbox: ZoneBbox,
  texts: PanelText[],
  style: ContainerStyle = 'solid-panel',
  contrastBoost = 0,
): Promise<{ alpha: number; scrimDirection: 'dark' | 'light'; sampledBg: RGB }> {
  const sampled = await sampleAverageColor(bgBuf, bbox);
  const lightCount = texts.filter(t => {
    const rgb = textColorToRgb(t.color);
    return relativeLuminance(rgb) > 0.5;
  }).length;
  const direction: 'dark' | 'light' = lightCount >= texts.length / 2 ? 'dark' : 'light';

  let maxAlpha = 0;
  for (const t of texts) {
    const rgb = textColorToRgb(t.color);
    const target = (t.isLargeText ? 3.0 : 4.5) + contrastBoost;
    if (contrastRatio(sampled, rgb) >= target) continue;
    const alpha = direction === 'dark'
      ? requiredDarkScrimAlpha(sampled, rgb, target, ALPHA_BOUNDS[style].max)
      : requiredLightScrimAlpha(sampled, rgb, target, ALPHA_BOUNDS[style].max);
    if (alpha > maxAlpha) maxAlpha = alpha;
  }
  if (style === 'solid-panel' || style === 'chip') {
    maxAlpha = Math.max(maxAlpha, ALPHA_BOUNDS[style].min);
  }
  return {
    alpha: Math.min(maxAlpha, ALPHA_BOUNDS[style].max),
    scrimDirection: direction,
    sampledBg: sampled,
  };
}

function textColorToRgb(c: string): RGB {
  if (c.startsWith('#')) return hexToRgb(c);
  // rgba(r, g, b, a) — approximate to opaque RGB.
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0 };
  }
  return { r: 255, g: 255, b: 255 };
}

/**
 * Fit a phone mockup into available canvas space. Source screenshots have a
 * fixed aspect ratio (height ÷ width, e.g. 2.17 for iPhone 6.9). The phone
 * frame must:
 *   - never exceed maxW horizontally
 *   - never exceed maxH vertically (otherwise it overflows into adjacent panels)
 *
 * Tries maxW first; if the resulting height > maxH, shrinks width to fit.
 * Returns the chosen { w, h } and the centred-in-area offsets so the layout
 * can position consistently.
 */
export function fitPhone(
  maxW: number,
  maxH: number,
  ssAspect: number,   // height / width of the source screenshot
): { w: number; h: number } {
  let w = maxW;
  let h = Math.round(w * ssAspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h / ssAspect);
  }
  return { w, h };
}

/** A merged group of zones that share one container. */
interface PlannedContainer {
  style: ContainerStyle;
  bbox: ZoneBbox;       // the container rect (already padded + merged)
  zones: ContainerZone[];
  /** "dark" → black scrim/panel; "light" → white. Picked from majority text colour. */
  scrimDirection: 'dark' | 'light';
}

/** Planner options. */
export interface PlanOpts {
  canvasW: number;
  canvasH: number;
  /** Gap threshold for merging (multiplier of the larger zone's line height). */
  mergeGapRatio?: number;
}

/**
 * Expand a single zone's text bbox into a container rect (style-aware padding).
 * For `soft-band`, the rect spans the full canvas width.
 */
function expandToContainer(z: ContainerZone, canvasW: number): ZoneBbox {
  const pad = PADDING[z.style];
  if (z.style === 'soft-band') {
    return {
      x: 0,
      y: z.bbox.y - pad.y,
      w: canvasW,
      h: z.bbox.h + pad.y * 2,
    };
  }
  return {
    x: z.bbox.x - pad.x,
    y: z.bbox.y - pad.y,
    w: z.bbox.w + pad.x * 2,
    h: z.bbox.h + pad.y * 2,
  };
}

function bboxOverlapsOrNear(a: ZoneBbox, b: ZoneBbox, gap: number): boolean {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const horizontalOverlap = !(ax2 < b.x - gap || bx2 < a.x - gap);
  const verticalOverlap   = !(ay2 < b.y - gap || by2 < a.y - gap);
  return horizontalOverlap && verticalOverlap;
}

function unionBboxes(boxes: ZoneBbox[]): ZoneBbox {
  const x0 = Math.min(...boxes.map(b => b.x));
  const y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w));
  const y1 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Group zones into shared containers. Two zones merge iff:
 *   1. They use the same container style.
 *   2. Their padded bboxes overlap or sit within `mergeGapRatio × line-height`.
 *
 * `chip` zones never merge — each pill stands alone.
 */
export function planContainers(zones: ContainerZone[], opts: PlanOpts): PlannedContainer[] {
  const gapRatio = opts.mergeGapRatio ?? 0.6;
  const expanded = zones.map(z => ({ z, rect: expandToContainer(z, opts.canvasW) }));

  // chip zones each become their own container; they don't merge.
  const chipGroups: PlannedContainer[] = expanded
    .filter(e => e.z.style === 'chip')
    .map(e => ({
      style: 'chip' as const,
      bbox: e.rect,
      zones: [e.z],
      scrimDirection: pickScrimDirection([e.z]),
    }));

  // Merge non-chip zones with adjacent same-style siblings.
  const groups: PlannedContainer[] = [];
  const remaining = expanded.filter(e => e.z.style !== 'chip');
  while (remaining.length) {
    const seed = remaining.shift()!;
    const cluster: typeof remaining = [seed];
    const gap = Math.max(8, seed.z.fontSize * gapRatio);
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (remaining[i].z.style !== seed.z.style) continue;
        const clusterBbox = unionBboxes(cluster.map(c => c.rect));
        if (bboxOverlapsOrNear(clusterBbox, remaining[i].rect, gap)) {
          cluster.push(remaining.splice(i, 1)[0]);
          merged = true;
        }
      }
    }
    const bbox = unionBboxes(cluster.map(c => c.rect));
    const clusterZones = cluster.map(c => c.z);
    groups.push({
      style: seed.z.style,
      bbox,
      zones: clusterZones,
      scrimDirection: pickScrimDirection(clusterZones),
    });
  }

  // Render order: solid-panel first (background), then soft-band, then chips on top.
  const order: Record<ContainerStyle, number> = { 'solid-panel': 0, 'soft-band': 1, 'chip': 2 };
  return [...groups, ...chipGroups].sort((a, b) => order[a.style] - order[b.style]);
}

/** Majority of text colours determines direction: light text → dark scrim. */
function pickScrimDirection(zones: ContainerZone[]): 'dark' | 'light' {
  let lightCount = 0;
  for (const z of zones) {
    const c = z.color.startsWith('#') ? hexToRgb(z.color) : hexToRgb('#FFFFFF');
    if (relativeLuminance(c) > 0.5) lightCount++;
  }
  return lightCount >= zones.length / 2 ? 'dark' : 'light';
}

// ─── Painter ─────────────────────────────────────────────────────────────────

/**
 * Solve the alpha needed under one container so every zone's text clears its
 * target contrast against the sampled background. Returns the max alpha needed
 * across all zones in the group, clamped to the style's allowed range.
 */
async function solveContainerAlpha(
  bgBuf: Buffer,
  group: PlannedContainer,
  contrastBoost: number,
): Promise<number> {
  const sampled = await sampleAverageColor(bgBuf, group.bbox);
  let maxAlpha = 0;
  for (const z of group.zones) {
    const text = z.color.startsWith('#') ? hexToRgb(z.color) : hexToRgb('#FFFFFF');
    const target = targetContrastFor(z.role, z.isLargeText) + contrastBoost;
    if (contrastRatio(sampled, text) >= target) continue;
    const alpha = group.scrimDirection === 'dark'
      ? requiredDarkScrimAlpha(sampled, text, target, ALPHA_BOUNDS[group.style].max)
      : requiredLightScrimAlpha(sampled, text, target, ALPHA_BOUNDS[group.style].max);
    if (alpha > maxAlpha) maxAlpha = alpha;
  }
  // Floor to the style's minimum if any zone needed a scrim at all; this gives
  // the container a consistent visual weight even when only one zone needed it.
  if (maxAlpha > 0) {
    maxAlpha = Math.max(maxAlpha, ALPHA_BOUNDS[group.style].min);
  }
  // For chips/solid-panels we want the container to be visible regardless —
  // they're part of the layout's visual language. Use min alpha as floor.
  if (group.style === 'chip' || group.style === 'solid-panel') {
    maxAlpha = Math.max(maxAlpha, ALPHA_BOUNDS[group.style].min);
  }
  return Math.min(maxAlpha, ALPHA_BOUNDS[group.style].max);
}

/** Build the SVG fragment for one container's rect (solid-panel / chip / band). */
function renderContainerRect(group: PlannedContainer, alpha: number): string {
  if (alpha === 0) return '';
  const fill = group.scrimDirection === 'dark' ? '#0A0F1F' : '#FFFFFF';
  // Allow override from any zone in the group (last write wins, but they
  // usually agree). This is how layouts paint coloured chips (accent fill).
  const override = group.zones.find(z => z.fillOverride)?.fillOverride;
  const fillColor = override ?? fill;

  const pad = PADDING[group.style];
  const r = group.style === 'chip' ? Math.floor(group.bbox.h / 2) : pad.radius;
  const { x, y, w, h } = group.bbox;

  if (group.style === 'soft-band') {
    // Feathered top edge using a tiny gradient. Keeps the band from reading
    // as a hard horizontal cut.
    const fillStub = group.scrimDirection === 'dark' ? '0,0,0' : '255,255,255';
    const gradId = `band${Math.floor(x + y + w + h)}`;
    return `<defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(${fillStub},0)"/>
          <stop offset="0.35" stop-color="rgba(${fillStub},${alpha})"/>
          <stop offset="1" stop-color="rgba(${fillStub},${alpha})"/>
        </linearGradient>
      </defs>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${gradId})"/>`;
  }

  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fillColor}" fill-opacity="${alpha.toFixed(3)}"/>`;
}

/** Build the SVG `<text>` fragment for one zone. */
function renderText(z: ContainerZone): string {
  const anchor = z.anchor ?? 'start';
  const weight = z.fontWeight ?? defaultWeight(z.role);
  const letter = z.letterSpacing !== undefined ? ` letter-spacing="${z.letterSpacing}"` : '';
  // Default text position: bottom of the bbox (text is anchored at baseline).
  const x = z.textX ?? (anchor === 'middle' ? z.bbox.x + z.bbox.w / 2
                       : anchor === 'end'    ? z.bbox.x + z.bbox.w
                       : z.bbox.x);
  const y = z.textY ?? z.bbox.y + Math.floor(z.bbox.h * 0.78);
  // Strip the surrounding `text` shadow defs from this layer — chip text on a
  // bright pill doesn't need a halo. Add it back where useful via the caller.
  return `<text x="${x}" y="${y}" text-anchor="${anchor}"
    font-family="Arial,Helvetica,sans-serif" font-size="${z.fontSize}" font-weight="${weight}"
    fill="${z.color}"${letter}>${escapeXml(z.text)}</text>`;
}

function defaultWeight(role: TextRole): number {
  switch (role) {
    case 'headline':    return 900;
    case 'subheadline': return 600;
    case 'caption':     return 500;
    case 'badge':       return 800;
    case 'label':       return 700;
  }
}

/**
 * Plan + render: returns an SVG overlay string ready to be composited on top
 * of `bgBuf` (with phone/icons already composited into it). The returned SVG
 * includes the container rects AND the text elements in the right z-order.
 *
 * `contrastBoost` is the auto-remediation knob — pass > 0 on retries to push
 * the solved alpha higher when the first render's gate failed.
 */
export async function paintContainers(
  bgBuf: Buffer,
  zones: ContainerZone[],
  opts: PlanOpts & { contrastBoost?: number },
): Promise<string> {
  // Auto-remediation: the retry loop in index.ts sets CONTRAST_BOOST in
  // env to push the target ratio up on subsequent attempts. Explicit opt
  // wins over env.
  const boost = opts.contrastBoost ?? Number(process.env.CONTRAST_BOOST ?? 0);
  const groups = planContainers(zones, opts);

  // Solve alpha for each container in parallel.
  const alphas = await Promise.all(groups.map(g => solveContainerAlpha(bgBuf, g, boost)));

  // Emit rects first (z-order: panels behind, chips on top), then ALL text on top.
  const rectFragments: string[] = [];
  const textFragments: string[] = [];
  groups.forEach((g, i) => {
    rectFragments.push(renderContainerRect(g, alphas[i]));
    for (const z of g.zones) textFragments.push(renderText(z));
  });

  return `${rectFragments.join('\n')}\n${textFragments.join('\n')}`;
}

/**
 * Convenience: wrap `paintContainers` output in a full `<svg>` element sized
 * to the canvas. Layouts that don't also need to embed `<defs>` etc. can use
 * this directly.
 */
export async function paintContainersSvg(
  bgBuf: Buffer,
  zones: ContainerZone[],
  opts: PlanOpts & { contrastBoost?: number; extraDefs?: string },
): Promise<string> {
  const inner = await paintContainers(bgBuf, zones, opts);
  return `<svg width="${opts.canvasW}" height="${opts.canvasH}" xmlns="http://www.w3.org/2000/svg">
    ${opts.extraDefs ?? ''}
    ${inner}
  </svg>`;
}
