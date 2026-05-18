import sharp from 'sharp';

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Cap font size so text never overflows `maxWidth`.
export function fitText(text: string, maxWidth: number, preferred: number, charRatio = 0.58): number {
  const len = Math.max(1, text.length);
  const maxByWidth = Math.floor(maxWidth / (len * charRatio));
  return Math.max(12, Math.min(preferred, maxByWidth));
}

/**
 * Fit a multi-line text block to BOTH width and height bounds. Returns the
 * largest fontSize where:
 *   - the longest line's width  ≤ maxW (lineLen × fontSize × charRatio)
 *   - the full block's height   ≤ maxH (lines × fontSize × lineHeightRatio)
 *
 * Use this whenever the text has a fixed container (panel, banner, caption
 * area below a phone). Plain `fitText` only checks width and lets multi-line
 * blocks overflow.
 */
export function fitTextBlock(
  lines: string[],
  maxW: number,
  maxH: number,
  preferred: number,
  charRatio = 0.58,
  lineHeightRatio = 1.08,
): number {
  if (lines.length === 0) return preferred;
  const longest = lines.reduce((a, b) => a.length > b.length ? a : b, '');
  const lineLen = Math.max(1, longest.length);
  const maxByWidth  = Math.floor(maxW / (lineLen * charRatio));
  const maxByHeight = Math.floor(maxH / (lines.length * lineHeightRatio));
  return Math.max(10, Math.min(preferred, maxByWidth, maxByHeight));
}

// Words that should never end a line — leaving them dangling reads badly
// (e.g. "Master the / Workout Plan" or "Become a / pro"). The smart wrapper
// tries multiple wrap targets and picks one without orphan endings.
const ORPHAN_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
  'with', 'to', 'of', 'in', 'on', 'at', 'by', 'as', 'is', 'are',
  'was', 'were', 'be', 'been', 'from', 'into', 'onto', 'over', 'under',
  'my', 'your', 'our', 'their', 'his', 'her',
]);

function greedyWrap(words: string[], target: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > target && cur) { lines.push(cur); cur = w; } else { cur = next; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function endsOnOrphan(line: string): boolean {
  const last = line.split(/\s+/).filter(Boolean).pop();
  return !!last && ORPHAN_WORDS.has(last.toLowerCase());
}

/**
 * Greedy wrap with orphan-word avoidance and a HARD max-lines cap. Tries the
 * given target plus nearby widths; returns the first result that:
 *   1. fits within maxLines
 *   2. has no orphan-word line ending (except possibly the last line)
 *
 * Returns `null` if no wrap target succeeds at fitting all the words into
 * `maxLines` lines. Callers must handle null (typically by retrying with a
 * higher maxLines). This avoids the silent-truncation bug where forcing
 * maxLines on an over-long string returned just the first slice of words.
 */
export function wrapSmart(text: string, target: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const candidates = [target, target - 2, target + 2, target - 4, target + 4, target - 6, target + 6, target - 8, target + 8]
    .filter(t => t >= 4);
  let fallback: string[] | null = null;
  for (const t of candidates) {
    const lines = greedyWrap(words, t);
    if (lines.length > maxLines) continue;
    if (!fallback) fallback = lines;
    const dangling = lines.slice(0, -1).some(endsOnOrphan);
    if (!dangling) return lines;
  }
  return fallback;   // null if nothing fit within maxLines
}

/**
 * Pick the (wrap-target × line-count) combination that produces the LARGEST
 * fitting font size for a fixed container. Use this when the text/container
 * relationship matters more than honouring an exact line count — e.g.
 * feature-graphic panels where shrinking text to 30 px is worse than wrapping
 * to 3 lines at 70 px.
 *
 * Returns the chosen lines and the fitted fontSize.
 */
export function fitWrapped(
  text: string,
  maxW: number,
  maxH: number,
  preferred: number,
  charRatio: number,
  lineHeightRatio: number,
  opts: { minSize?: number; maxLines?: number; targets?: number[]; hardMaxLines?: number } = {},
): { lines: string[]; size: number } {
  const minSize  = opts.minSize  ?? Math.floor(preferred * 0.45);
  const maxLines = opts.maxLines ?? 3;
  // Hard ceiling: how many lines we'll *escalate to* if the layout's preferred
  // maxLines can't fit text at minSize. Honouring minSize matters more than
  // honouring maxLines — a 4-line subhead is readable; a 33-px subhead is not.
  const hardMaxLines = Math.max(maxLines, opts.hardMaxLines ?? 5);
  const targets  = opts.targets  ?? [14, 18, 22, 26, 30];

  // Try candidate (line-count × wrap-target) combinations up to hardMaxLines.
  // Pick the largest size that:
  //   1. clears minSize, AND
  //   2. uses the fewest lines among equal-size candidates (preserves
  //      visual rhythm — don't wrap 1→3 lines just to gain 1 px).
  let best: { lines: string[]; size: number; lc: number } | null = null;
  let anyFit: { lines: string[]; size: number; lc: number } | null = null;
  for (let lc = 1; lc <= hardMaxLines; lc++) {
    for (const tgt of targets) {
      const lines = wrapSmart(text, tgt, lc);
      if (!lines || lines.length !== lc) continue;
      const size = fitTextBlock(lines, maxW, maxH, preferred, charRatio, lineHeightRatio);
      const candidate = { lines, size, lc };
      if (!anyFit || size > anyFit.size) anyFit = candidate;
      if (size < minSize) continue;
      // Prefer larger size; tie-break on fewer lines so we don't gratuitously wrap.
      if (!best || size > best.size || (size === best.size && lc < best.lc)) {
        best = candidate;
      }
    }
  }
  if (best) return { lines: best.lines, size: best.size };

  // No candidate cleared minSize even at hardMaxLines. Honour the floor by
  // returning a wrap at hardMaxLines with size pinned to minSize — accept
  // potential vertical overflow rather than rendering unreadable text. The
  // contrast gate will still flag any residual issue, and the layout's
  // container clipping (overflow:hidden equivalent via SVG) will absorb it.
  let fallback: string[] | null = null;
  for (const tgt of [...targets].sort((a, b) => b - a).concat([60, 80, 120])) {
    fallback = wrapSmart(text, tgt, hardMaxLines);
    if (fallback && fallback.length <= hardMaxLines) break;
  }
  const lines = fallback ?? [text];
  return { lines, size: Math.max(minSize, anyFit?.size ?? minSize) };
}

// Round corners via SVG mask. ensureAlpha avoids black corner fringing.
export async function roundCorners(buf: Buffer, w: number, h: number, r: number): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`
  );
  return sharp(buf)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// Resize screenshot, wrap in a thin dark bezel + camera pill + home bar.
//
// Bezel sized for marketing-mockup feel — modern phones have ~2-3mm bezels
// which on a 1320-px wide canvas works out to ~20-26 px. Layouts pass a
// `borderPx` hint, but we clamp it to keep the look consistent across sizes.
//
// `targetW`/`targetH` is the OUTER device size. The inner screen fits exactly
// inside (target - 2*borderPx).
export async function makeDeviceFrame(
  screenshotPath: string,
  targetW: number,
  targetH: number,
  borderPxHint = 0,
  cornerRHint = 0,
  cropPosition: 'top' | 'centre' | 'bottom' = 'top',
  screenshotFit: 'cover' | 'fill' = 'cover',
): Promise<Buffer> {
  // Resolve frame dimensions from the actual target size, ignoring the hint
  // when it would produce a chunky-looking frame on tablets. Modern devices:
  //   bezel ≈ 1.6–2.0% of device width
  //   outer corner radius ≈ 9–11% of device width
  //   inner screen radius ≈ outer minus border
  const borderPx = borderPxHint > 0
    ? Math.min(borderPxHint, Math.floor(targetW * 0.022))
    : Math.max(8, Math.floor(targetW * 0.018));
  const cornerR  = cornerRHint > 0
    ? cornerRHint
    : Math.floor(targetW * 0.095);

  const screenW = targetW - borderPx * 2;
  const screenH = targetH - borderPx * 2;
  const screenCornerR = Math.max(4, cornerR - borderPx);

  const screenContent = await sharp(screenshotPath)
    .resize(screenW, screenH, { fit: screenshotFit, position: cropPosition })
    .png()
    .toBuffer();
  const roundedScreen = await roundCorners(screenContent, screenW, screenH, screenCornerR);

  // Camera pill (top-centre) — small dynamic-island-esque element
  const camW  = Math.floor(targetW * 0.10);
  const camH  = Math.max(4, Math.floor(borderPx * 0.55));
  const camX  = Math.floor((targetW - camW) / 2);
  const camY  = Math.max(2, Math.floor(borderPx * 0.30));

  // Home bar (bottom-centre)
  const barW  = Math.floor(targetW * 0.26);
  const barH  = Math.max(3, Math.floor(borderPx * 0.22));
  const barX  = Math.floor((targetW - barW) / 2);
  const barY  = targetH - Math.floor(borderPx * 0.45) - barH;

  const detailsSvg = Buffer.from(
    `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${camX}" y="${camY}" width="${camW}" height="${camH}" rx="${Math.floor(camH / 2)}" fill="#0F0F10"/>
      <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${Math.floor(barH / 2)}" fill="#3A3A3D"/>
    </svg>`
  );

  // Bezel: dark grey with a subtle 1px lighter inset for a glassy edge
  const assembled = await sharp({
    create: { width: targetW, height: targetH, channels: 3, background: '#15161A' },
  })
  .composite([
    { input: roundedScreen, top: borderPx, left: borderPx },
    { input: detailsSvg,    top: 0,        left: 0        },
  ])
  .png()
  .toBuffer();

  return roundCorners(assembled, targetW, targetH, cornerR);
}

// Resize background buffer to exact canvas (cover crop from centre).
export async function resizeBg(buf: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buf).resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
}

/**
 * Read the screenshot's native height/width ratio (height ÷ width). This is
 * the source of truth for sizing the device frame — it ensures iPad sources
 * render with an iPad-shaped frame, iPhone sources with an iPhone shape, and
 * the screenshot is never clipped or stretched. Falls back to a tall-phone
 * default if metadata is unavailable.
 */
export async function screenshotAspect(screenshotPath: string): Promise<number> {
  const meta = await sharp(screenshotPath).metadata();
  if (meta.width && meta.height) return meta.height / meta.width;
  return 19.5 / 9; // tall-phone fallback
}

// Circular crop (used for app icons in card / cta layouts).
export async function circularCrop(buf: Buffer, size: number): Promise<Buffer> {
  const resized = await sharp(buf).resize(size, size, { fit: 'cover' }).png().toBuffer();
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  );
  return sharp(resized)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ─── Layout-shared utilities ─────────────────────────────────────────────────

/**
 * Rotate a buffer (already square or rectangular) by the given degrees.
 * Returns a fresh PNG buffer with transparent background.
 */
export async function rotateBuffer(buf: Buffer, degrees: number): Promise<Buffer> {
  if (degrees === 0) return buf;
  return sharp(buf)
    .rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/**
 * Parse "Quickly [FIND FEEDS] that match" into ordered tokens describing the
 * plain and highlighted runs. Layouts that support pill highlights consume
 * this; non-supporting layouts use the joined plain version (brackets stripped).
 */
export interface HeadlineToken { text: string; highlight: boolean; }

export function parseHeadline(headline: string): HeadlineToken[] {
  const tokens: HeadlineToken[] = [];
  const re = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(headline)) !== null) {
    if (m.index > lastIndex) tokens.push({ text: headline.slice(lastIndex, m.index), highlight: false });
    tokens.push({ text: m[1], highlight: true });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < headline.length) tokens.push({ text: headline.slice(lastIndex), highlight: false });
  return tokens.length > 0 ? tokens : [{ text: headline, highlight: false }];
}

/** Strip [bracket] markers from a headline. Used by all non-pill layouts. */
export function stripBrackets(headline: string): string {
  return headline.replace(/\[([^\]]+)\]/g, '$1');
}

/**
 * Render a card SVG block (rounded white rectangle with optional drop shadow).
 * Returns the SVG markup string ready for embedding inside a parent <svg>.
 */
export function cardSvg(x: number, y: number, w: number, h: number, fill = '#FFFFFF', radius = 28): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="${fill}" filter="url(#cardShadow)"/>`;
}

/** SVG <defs> entry for a soft drop shadow used by cardSvg. Embed once in parent svg. */
export const CARD_SHADOW_FILTER = `<filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
  <feOffset dx="0" dy="4"/>
  <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

/**
 * SVG <defs> entry for a subtle text shadow used by every layout's text
 * overlay. The shadow is barely visible in good-contrast cases but rescues
 * legibility when the text colour and the underlying background are too close.
 * Reference with `filter="url(#textShadow)"` on <text> elements.
 */
export const TEXT_SHADOW_FILTER = `<filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
  <feOffset dx="0" dy="2"/>
  <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

/**
 * Single drop-in block — embed once at the top of an overlay SVG to give every
 * <text> element a subtle dark outline. Uses SVG `paint-order: stroke` so the
 * stroke renders BEHIND the fill (creating a halo, not an outlined glyph).
 *
 * This is the print/marketing standard for white text over photos or busy
 * backgrounds, and it's universally supported by SVG renderers (works under
 * sharp / librsvg, unlike CSS filter blocks). It rescues legibility when the
 * adaptive text-colour pick is borderline (e.g. white on mid-luminance teal).
 */
export const TEXT_SHADOW_DEFS = `<style>
  text {
    paint-order: stroke fill;
    stroke: rgba(0,0,0,0.65);
    stroke-width: 5px;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
</style>`;
