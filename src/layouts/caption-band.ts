import sharp from 'sharp';
import { resizeBg, stripBrackets, makeDeviceFrame, screenshotAspect, fitWrapped, escapeXml } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { solvePanelAlpha, fitPhone } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// CAPTION BAND
// Phone hero in the top ~70%, full-width soft-band caption at the bottom.
// Proportions from design/layouts-phone-portrait-shots.html (#2) and
// design/layouts-tablet-portrait-shots.html (TP-02).
//
// Critical: the phone is CAPPED so its bottom never overlaps the caption
// band. fitPhone() shrinks the phone width if necessary.

interface CaptionProps {
  phone:    { topY: number; sidePad: number; bottomGap: number };  // fractions
  band:     { y: number; h: number };                              // fractions of H
  headline: { font: number; lineH: number; y0: number;             // y0 = first baseline as fraction of H
              cx: number; maxLines: number; minFont: number };
  subhead:  { font: number; y0: number; cx: number;
              maxLines: number; minFont: number };
}

// Floor multipliers (per src/contrast-gate.ts MIN_FONT_AT_1290 with scaled-by-canvas):
//   headline ≥ 0.062 (clears 80/1290) — using 0.066 for margin
//   subhead  ≥ 0.0372 (clears 48/1290) — using 0.040 for margin
// `minFont` is what fitWrapped will *escalate lines to honour*; preferred sits above.
// `maxLines: 2` for subhead lets fitWrapped wrap real-world strings without
// shrinking below the floor — the previous `maxLines: 1` forced 30-px subheads
// on long copy.
const PHONE: CaptionProps = {
  phone:    { topY: 0.094, sidePad: 0.188, bottomGap: 0.025 },
  band:     { y: 0.719, h: 0.281 },
  headline: { font: 0.0813, lineH: 1.12, y0: 0.797, cx: 0.500, maxLines: 2, minFont: 0.066 },
  subhead:  { font: 0.0556, y0: 0.913, cx: 0.500, maxLines: 2, minFont: 0.040 },
};

const TABLET: CaptionProps = {
  phone:    { topY: 0.078, sidePad: 0.188, bottomGap: 0.025 },
  band:     { y: 0.728, h: 0.272 },
  headline: { font: 0.0625, lineH: 1.10, y0: 0.825, cx: 0.500, maxLines: 2, minFont: 0.066 },
  subhead:  { font: 0.0500, y0: 0.953, cx: 0.500, maxLines: 2, minFont: 0.040 },
};

export async function captionBand(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('caption-band requires a screenshot source');

  const isTablet = (H / W) < 1.6;
  const P = isTablet ? TABLET : PHONE;

  const headline = stripBrackets(screenshot.headline);
  const subheadline = screenshot.subheadline;

  // ── Compute the caption band rect first; phone must NOT overlap it. ────
  const bandY = Math.round(H * P.band.y);
  const bandH = H - bandY;
  const bandBbox = { x: 0, y: bandY, w: W, h: bandH };

  // ── Phone (capped to fit above the band) ───────────────────────────────
  const ssAspect = await screenshotAspect(screenshotPath);
  const phoneTopY = Math.round(H * P.phone.topY);
  const phoneAreaH = bandY - phoneTopY - Math.round(H * P.phone.bottomGap);
  const phoneMaxW = W - Math.round(W * P.phone.sidePad) * 2;
  const { w: phoneW, h: phoneH } = fitPhone(phoneMaxW, phoneAreaH, ssAspect);
  const phoneLeft = Math.round((W - phoneW) / 2);
  const phoneTop = phoneTopY + Math.floor((phoneAreaH - phoneH) / 2);
  const phoneBuf = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const bgWithPhone = await sharp(bg)
    .composite([{ input: phoneBuf, top: phoneTop, left: phoneLeft }])
    .png()
    .toBuffer();

  // ── Caption fit ────────────────────────────────────────────────────────
  const safeW = Math.round(W * 0.86);
  const headFont = Math.round(W * P.headline.font);
  // Reserve ~55% of band for headline when there's a subhead, else 80%.
  const headBudgetH = subheadline ? Math.round(bandH * 0.50) : Math.round(bandH * 0.80);
  const headWrap = fitWrapped(headline, safeW, headBudgetH, headFont, 0.60, P.headline.lineH, {
    maxLines: P.headline.maxLines,
    minSize: Math.round(W * P.headline.minFont),
  });
  const headLineH = Math.round(headWrap.size * P.headline.lineH);

  const subFont = Math.round(W * P.subhead.font);
  const subBudgetH = subheadline ? Math.round(bandH * 0.25) : 0;
  const subWrap = subheadline
    ? fitWrapped(subheadline, safeW, subBudgetH, subFont, 0.55, 1.25, {
        maxLines: P.subhead.maxLines,
        minSize: Math.round(W * P.subhead.minFont),
      })
    : { lines: [] as string[], size: 0 };
  const subLineH = subWrap.size ? Math.round(subWrap.size * 1.25) : 0;

  const cx = Math.round(W * P.headline.cx);
  const headY0 = Math.round(H * P.headline.y0);
  const subY0 = Math.round(H * P.subhead.y0);

  // ── Solve band alpha against actual pixels under the band ──────────────
  const bandTexts = [
    { color: theme.headline_color, isLargeText: true },
    ...(subWrap.lines.length ? [{ color: theme.subheadline_color, isLargeText: false }] : []),
  ];
  const { alpha: bandAlpha, scrimDirection } = await solvePanelAlpha(
    bgWithPhone, bandBbox, bandTexts, 'soft-band',
    Number(process.env.CONTRAST_BOOST ?? 0),
  );
  const bandFillRgb = scrimDirection === 'dark' ? '0,0,0' : '255,255,255';
  const gradId = `band${Math.floor(W + H + bandY)}`;

  // ── Overlay ────────────────────────────────────────────────────────────
  // Soft band: gradient with feathered top edge (alpha 0 at top → solid at 35%).
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgba(${bandFillRgb},0)"/>
        <stop offset="0.35" stop-color="rgba(${bandFillRgb},${bandAlpha.toFixed(3)})"/>
        <stop offset="1" stop-color="rgba(${bandFillRgb},${bandAlpha.toFixed(3)})"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="url(#${gradId})"/>
    ${headWrap.lines.map((line, i) => {
      const baseline = headY0 + i * headLineH;
      return `<text x="${cx}" y="${baseline}" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="${headWrap.size}" font-weight="800"
        letter-spacing="-0.5" fill="${theme.headline_color}">${escapeXml(line)}</text>`;
    }).join('\n')}
    ${subWrap.lines.map((line, i) => {
      const baseline = subY0 + i * subLineH;
      return `<text x="${cx}" y="${baseline}" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="${subWrap.size}" font-weight="500"
        fill="${theme.subheadline_color}">${escapeXml(line)}</text>`;
    }).join('\n')}
  </svg>`;

  const buffer = await sharp(bgWithPhone)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // ── Gate zones ─────────────────────────────────────────────────────────
  const headBboxes = headWrap.lines.map((line, i) =>
    estimateTextBbox({ x: cx, y: headY0 + i * headLineH, text: line,
      fontSize: headWrap.size, anchor: 'middle', charRatio: 0.60 }),
  );
  const subBboxes = subWrap.lines.map((line, i) =>
    estimateTextBbox({ x: cx, y: subY0 + i * subLineH, text: line,
      fontSize: subWrap.size, anchor: 'middle', charRatio: 0.55 }),
  );
  const zones: TextZone[] = [];
  if (headBboxes.length) {
    zones.push({
      role: 'headline', text: headWrap.lines.join(' '),
      bbox: unionBbox(headBboxes),
      color: theme.headline_color, fontSize: headWrap.size, isLargeText: true,
    });
  }
  if (subBboxes.length) {
    zones.push({
      role: 'subheadline', text: subWrap.lines.join(' '),
      bbox: unionBbox(subBboxes),
      color: theme.subheadline_color, fontSize: subWrap.size,
      isLargeText: subWrap.size >= W * 0.022,
    });
  }
  return { buffer, zones };
}
