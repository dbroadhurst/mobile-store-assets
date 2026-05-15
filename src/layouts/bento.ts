import sharp from 'sharp';
import {
  escapeXml, fitText, fitTextBlock, makeDeviceFrame, resizeBg, stripBrackets,
  screenshotAspect, wrapSmart, TEXT_SHADOW_DEFS,
} from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout — BENTO (phone hero + horizontal numbered feature row)
//
// Headline top, large phone hero centred in the upper canvas, then a row of
// up to 3 numbered features anchored below the phone, subhead at the foot.
// Each feature is a compact typographic block (big accent numeral, slim
// accent rule, bold uppercase label) sharing equal width across the row.
//
// History: this layout went through three rejected attempts before the
// horizontal row treatment landed. Earlier versions used 3 vertically-
// stacked white tiles ("looks like an ugly list"), then dropped the tiles
// for a typographic column ("phone is too tall — features cluster at the
// top leaving empty bg below"). The horizontal row anchors the features as
// a footer-style accent without competing with the phone for vertical real
// estate.
export async function bento(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('bento requires a screenshot source');

  const padX = Math.floor(W * 0.055);
  const safe = W - padX * 2;

  // ── Headline (top band) ───────────────────────────────────────────────────
  const headline = stripBrackets(screenshot.headline);
  const headlineLines = wrapSmart(headline, 22, 2) ?? [headline];
  const headlineSz = fitText(longest(headlineLines), safe, Math.floor(W * 0.062), 0.58);
  const lineH = Math.floor(headlineSz * 1.10);
  const headlineY0 = Math.floor(H * 0.05);
  const headlineH  = headlineLines.length * lineH;
  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="800" letter-spacing="-1"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // ── Feature row (below phone) ─────────────────────────────────────────────
  // Reserve a horizontal band for the feature row at the bottom of the
  // canvas. Compute its height up front so we know how much vertical space
  // is left for the phone hero in the middle.
  const features  = (screenshot.features ?? []).slice(0, 3);
  const featCount = features.length;
  const hasFeatures = featCount > 0;

  const numSz       = Math.floor(W * 0.060);
  const labelPref   = Math.floor(W * 0.030);
  const ruleH       = Math.max(3, Math.floor(W * 0.006));
  const ruleW       = Math.floor(W * 0.035);
  const numToRule   = Math.floor(W * 0.014);
  const ruleToLabel = Math.floor(W * 0.016);
  // Single feature occupies floor(safe / featCount) wide; the label inside
  // is then fit to that width with internal padding to keep columns clear
  // of one another.
  const featColW    = hasFeatures ? Math.floor(safe / featCount) : 0;
  const featColPad  = Math.floor(W * 0.015);
  const labelMaxW   = Math.max(60, featColW - featColPad * 2);
  const labelMaxH   = Math.floor(H * 0.10);

  // Pre-compute label wrap + size so we know the row's total height.
  const prepared = features.map(label => {
    const wrapped = wrapSmart(label.toUpperCase(), 14, 2) ?? [label.toUpperCase()];
    const sz      = fitTextBlock(wrapped, labelMaxW, labelMaxH, labelPref, 0.58, 1.18);
    const lineHi  = Math.floor(sz * 1.18);
    return { wrapped, sz, lineHi };
  });
  const maxLabelLines = prepared.reduce((m, p) => Math.max(m, p.wrapped.length), 1);
  const maxLineHi     = prepared.reduce((m, p) => Math.max(m, p.lineHi), Math.floor(labelPref * 1.18));
  const featRowH = hasFeatures
    ? numSz + numToRule + ruleH + ruleToLabel + maxLabelLines * maxLineHi
    : 0;

  // Anchor: feature row bottom sits at H*0.86 (above the subhead band).
  const featRowBottomY = Math.floor(H * 0.86);
  const featRowTopY    = featRowBottomY - featRowH;

  const featuresSvg = prepared.map(({ wrapped, sz, lineHi }, i) => {
    const colX     = padX + i * featColW;
    const textX    = colX + featColPad;
    const numY     = featRowTopY + Math.floor(numSz * 0.92);
    const ruleY    = featRowTopY + numSz + numToRule;
    const labelY0  = ruleY + ruleH + ruleToLabel;
    const labelSvg = wrapped.map((line, j) =>
      `<text x="${textX}" y="${labelY0 + (j + 1) * lineHi - Math.floor(lineHi * 0.22)}"
        font-family="Arial,Helvetica,sans-serif" font-size="${sz}" font-weight="800"
        letter-spacing="1" fill="${theme.headline_color}">${escapeXml(line)}</text>`
    ).join('\n');
    const idx = String(i + 1).padStart(2, '0');
    return `<text x="${textX}" y="${numY}" font-family="Arial,Helvetica,sans-serif"
        font-size="${numSz}" font-weight="900" letter-spacing="-2"
        fill="${theme.accent}">${idx}</text>
      <rect x="${textX}" y="${ruleY}" width="${ruleW}" height="${ruleH}" rx="${ruleH / 2}"
        fill="${theme.accent}"/>
      ${labelSvg}`;
  }).join('\n');

  // ── Phone (hero, centred in remaining vertical band) ──────────────────────
  const phoneRegionTop    = headlineY0 + headlineH + Math.floor(H * 0.035);
  const phoneRegionBottom = hasFeatures ? featRowTopY - Math.floor(H * 0.035) : Math.floor(H * 0.86);
  const phoneRegionH      = Math.max(0, phoneRegionBottom - phoneRegionTop);
  const aspect            = await screenshotAspect(screenshotPath);
  let phoneH = phoneRegionH;
  let phoneW = Math.round(phoneH / aspect);
  if (phoneW > safe) {
    phoneW = safe;
    phoneH = Math.round(phoneW * aspect);
  }
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneLeft  = Math.floor((W - phoneW) / 2);
  const phoneTop   = phoneRegionTop + Math.floor((phoneRegionH - phoneH) / 2);

  // ── Subhead (bottom band) ─────────────────────────────────────────────────
  const subWrapped = wrapSmart(screenshot.subheadline ?? '', 40, 2) ?? [];
  const subSz = subWrapped.length
    ? fitText(longest(subWrapped), safe, Math.floor(W * 0.040), 0.55)
    : 0;
  const subLineH = Math.floor(subSz * 1.30);
  const subY0    = featRowBottomY + Math.floor(H * 0.025);
  const subSvg = subWrapped.map((line, i) => `
    <text x="${padX}" y="${subY0 + (i + 1) * subLineH - Math.floor(subLineH * 0.25)}"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${featuresSvg}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneFrame,           top: phoneTop, left: phoneLeft },
      { input: Buffer.from(overlay), top: 0,        left: 0         },
    ])
    .png()
    .toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}
