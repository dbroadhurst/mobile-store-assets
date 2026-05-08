import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, screenshotAspect, stripBrackets, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// LANDSCAPE-SPLIT
// Wide canvas. Phone occupies the right half (with native aspect — landscape
// sources render landscape-shaped). Headline + subhead fill the left half.
//
// Use for landscape-native screenshots (games, video, navigation).
export async function landscapeSplit(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('landscape-split requires a screenshot source');

  const headline    = stripBrackets(screenshot.headline);
  const subheadline = screenshot.subheadline;

  // Phone right side, native aspect
  const ssAspect = await screenshotAspect(screenshotPath);   // h/w
  const phoneH   = Math.floor(H * 0.82);
  const phoneW   = Math.round(phoneH / ssAspect);
  const phoneTop = Math.floor((H - phoneH) / 2);
  // Pin to right with slight inset
  const phoneLeft = W - phoneW - Math.floor(W * 0.05);
  const phoneBuf  = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');

  // Text fills left half
  const padX = Math.floor(W * 0.05);
  const safe = Math.max(W * 0.40, phoneLeft - padX * 2);

  const headlineLines = wrap(headline, 18);
  const headlineSz = fitText(longest(headlineLines), safe, Math.floor(H * 0.10), 0.60);
  const lineH = Math.floor(headlineSz * 1.15);

  const subWrapped = wrap(subheadline ?? '', 36);
  const subSz = fitText(longest(subWrapped), safe, Math.floor(H * 0.046), 0.55);
  const subLineH = Math.floor(subSz * 1.30);

  const totalH = headlineLines.length * lineH + Math.floor(H * 0.04) + subWrapped.length * subLineH;
  const headlineY0 = Math.floor((H - totalH) / 2);
  const subY0      = headlineY0 + headlineLines.length * lineH + Math.floor(H * 0.04);

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="800" fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const subSvg = subWrapped.map((line, i) =>
    `<text x="${padX}" y="${subY0 + i * subLineH + subSz * 0.85}" font-family="Arial,Helvetica,sans-serif"
      font-size="${subSz}" fill="${theme.subheadline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf,             top: phoneTop, left: phoneLeft },
      { input: Buffer.from(overlay), top: 0,        left: 0         },
    ])
    .png()
    .toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}
function wrap(text: string, target: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > target && cur) { lines.push(cur); cur = w; } else { cur = next; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
