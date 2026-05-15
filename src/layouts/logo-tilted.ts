import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, stripBrackets, screenshotAspect, wrapSmart, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 04 — HEADLINE + TILTED PHONE  (Unstoppable opener)
// Massive bold headline up top, phone tilted at the bottom and partially
// visible (bleeds off the right and bottom edges).
export async function logoTilted(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('logo-tilted requires a screenshot source');

  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const padX = Math.floor(W * 0.07);
  const safe = W * 0.85;

  // Short-line "WEB3 / WALLET" feel — target ~9 chars/line. wrapSmart never
  // silently truncates; if the headline needs more lines, font size shrinks.
  const finalLines = wrapSmart(headline, 9, 4) ?? [headline];
  // charRatio 0.68 — bold ALL-CAPS Helvetica is wider than mixed-case
  const headlineSz = fitText(longest(finalLines), safe, Math.floor(W * 0.135), 0.68);
  const lineH = Math.floor(headlineSz * 1.07);

  // Anchored near the top — there's no longer an app icon above the headline,
  // so we don't leave room for one. (Was 0.18 when the icon lived at 0.08.)
  const headlineY0 = Math.floor(H * 0.06);
  const headlineSvg = finalLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="900" fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Tilted phone bottom-right, bleeds off
  // Phone aspect derived from the screenshot's native ratio.
  const phoneW = Math.floor(W * 0.62);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const phoneRotated = await rotateBuffer(phoneFrame, -8);
  const phoneMeta = await sharp(phoneRotated).metadata();

  const phoneTop  = Math.floor(H * 0.50);
  const phoneLeft = W - phoneMeta.width! + Math.floor(W * 0.10);

  // Subheadline below the headline block. wrap + fit so long subheads (which
  // were previously rendering as a single line that overflowed off-canvas)
  // wrap to multiple lines inside the safe width.
  const subWrapped = wrapSmart(screenshot.subheadline ?? '', 30, 3) ?? [];
  const subSz = subWrapped.length
    ? fitText(longest(subWrapped), safe, Math.floor(W * 0.050), 0.55)
    : 0;
  const subLineH = Math.floor(subSz * 1.30);
  const subY  = headlineY0 + finalLines.length * lineH + Math.floor(H * 0.045);
  const subSvg = subWrapped.map((line, i) => `
    <text x="${padX}" y="${subY + i * subLineH}" font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: phoneRotated, top: phoneTop, left: phoneLeft },
    { input: Buffer.from(overlay), top: 0, left: 0 },
  ];

  return sharp(bg).composite(composites).png().toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}
