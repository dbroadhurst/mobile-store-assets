import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, stripBrackets, circularCrop, screenshotAspect } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 04 — LOGO + HEADLINE + TILTED PHONE  (Unstoppable opener)
// Brand logo top-left, massive bold headline below, phone tilted at the bottom
// and partially visible (bleeds off the right and bottom edges).
export async function logoTilted(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('logo-tilted requires a screenshot source');

  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const padX = Math.floor(W * 0.07);
  const safe = W * 0.85;

  // Wrap to 2-4 short lines (target ~7 chars/line for "WEB3 / WALLET" feel)
  const words = headline.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > 9 && cur) { lines.push(cur); cur = w; } else { cur = next; }
  }
  if (cur) lines.push(cur);
  const finalLines = lines.slice(0, 4);
  // charRatio 0.68 — bold ALL-CAPS Helvetica is wider than mixed-case
  const headlineSz = fitText(longest(finalLines), safe, Math.floor(W * 0.135), 0.68);
  const lineH = Math.floor(headlineSz * 1.07);

  const headlineY0 = Math.floor(H * 0.18);
  const headlineSvg = finalLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="900" fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // App icon top-left — 10.5% of canvas width. Reads as a confident brand
  // mark at thumbnail size without competing with the headline. (Bumped from
  // 7% on review feedback — the smaller chip was reading as decorative noise
  // rather than a brand cue.)
  const iconSize = Math.floor(W * 0.105);
  const iconY    = Math.floor(H * 0.08);
  const iconPath = path.join(projectRoot, config.app.icon);
  let iconComposite: sharp.OverlayOptions | null = null;
  if (fs.existsSync(iconPath)) {
    const iconBuf = await circularCrop(await sharp(iconPath).png().toBuffer(), iconSize);
    iconComposite = { input: iconBuf, top: iconY, left: padX };
  }

  // (App-name wordmark removed — the store already shows the name next to
  // every screenshot. The icon alone is the brand mark here.)
  const brandSvg = '';

  // Tilted phone bottom-right, bleeds off
  // Phone aspect derived from the screenshot's native ratio.
  const phoneW = Math.floor(W * 0.62);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const phoneRotated = await rotateBuffer(phoneFrame, -8);
  const phoneMeta = await sharp(phoneRotated).metadata();

  const phoneTop  = Math.floor(H * 0.50);
  const phoneLeft = W - phoneMeta.width! + Math.floor(W * 0.10);

  // Subheadline below headline (sized larger per visual-hierarchy review)
  const subSz = Math.floor(W * 0.050);
  const subY  = headlineY0 + finalLines.length * lineH + Math.floor(H * 0.045);
  const subSvg = screenshot.subheadline ? `
    <text x="${padX}" y="${subY}" font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(screenshot.subheadline)}</text>` : '';

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${brandSvg}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: phoneRotated, top: phoneTop, left: phoneLeft },
  ];
  if (iconComposite) composites.push(iconComposite);
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  return sharp(bg).composite(composites).png().toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}
