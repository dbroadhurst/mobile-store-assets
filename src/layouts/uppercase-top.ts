import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, stripBrackets, screenshotAspect, wrapSmart, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 03 — UPPERCASE TOP + FULL-BLEED PHONE  (Unstoppable)
// Bold ALL-CAPS headline (1-2 lines) at top; phone fills the bottom and may
// bleed off the canvas edge for an immersive feel. Subheadline anchors to the
// rendered headline (not a fixed Y) to avoid overlap on tall canvases.
export async function uppercaseTop(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('uppercase-top requires a screenshot source');

  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const padX = Math.floor(W * 0.06);
  const safe = W - padX * 2;

  // Wrap to fit. Earlier this layout truncated to 2 lines, which silently
  // dropped the tail of any 3-line headline — last word lost without warning.
  // wrapSmart expands the wrap target until the headline fits ≤3 lines, then
  // fitText scales the font — content integrity wins over the 2-line ideal.
  const finalLines = wrapSmart(headline, 14, 3) ?? [headline];
  // charRatio 0.68 — bold ALL-CAPS Helvetica is wider than mixed-case
  const headlineSz = fitText(longest(finalLines), safe, Math.floor(W * 0.115), 0.68);
  const lineH = Math.floor(headlineSz * 1.05);

  const headlineY0 = Math.floor(H * 0.06);
  const headlineSvg = finalLines.map((line, i) =>
    `<text x="${W / 2}" y="${headlineY0 + (i + 1) * lineH}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="900"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Subhead — placed below the rendered headline with comfortable spacing.
  // Wrap to ≤3 lines and fit the canvas width; wrapSmart never silently
  // drops content.
  const subWrapped = wrapSmart(screenshot.subheadline ?? '', 36, 3) ?? [];
  const subSz = fitText(longest(subWrapped), safe, Math.floor(W * 0.050), 0.56);
  const subLineH = Math.floor(subSz * 1.30);
  const subY0 = headlineY0 + finalLines.length * lineH + Math.floor(H * 0.038);
  const subSvg = screenshot.subheadline ? subWrapped.map((line, i) => `
    <text x="${W / 2}" y="${subY0 + i * subLineH}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('') : '';
  const subY  = subY0 + (subWrapped.length - 1) * subLineH;

  // Phone: starts below the (headline + subhead) block, fills the rest. Uses
  // the screenshot's NATIVE aspect ratio so iPad sources (3:4) render with an
  // iPad-shaped frame and iPhone sources (~9:19.5) render with an iPhone shape.
  // May bleed off the canvas if the phone is taller than what's available.
  const sidePad = Math.floor(W * 0.07);
  const phoneW  = W - sidePad * 2;
  const phoneTop = subY + Math.floor(H * 0.04);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const visibleH = Math.max(0, H - phoneTop);
  const fullFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const phoneBuf  = phoneH > visibleH
    ? await sharp(fullFrame).extract({ left: 0, top: 0, width: phoneW, height: visibleH }).png().toBuffer()
    : fullFrame;

  // Text-safe scrim behind the headline area
  const scrimH = phoneTop;
  const scrim = `<defs>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(0,0,0,${theme.scrim * 0.55})"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${scrimH}" fill="url(#topScrim)"/>`;

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${scrim}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf,             top: phoneTop, left: sidePad },
      { input: Buffer.from(overlay), top: 0,        left: 0       },
    ])
    .png()
    .toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}
