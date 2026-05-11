import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, screenshotAspect, stripBrackets, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// LANDSCAPE-SPLIT
// Horizontal split for wide canvases: headline + subhead in a top band,
// phone fills the lower band with native aspect, centred. Avoids overlap on
// landscape-native screenshots where the device frame would otherwise eat
// the full width.
export async function landscapeSplit(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('landscape-split requires a screenshot source');

  const headline    = stripBrackets(screenshot.headline);
  const subheadline = screenshot.subheadline;

  // Top text band — left-aligned, full width with padding. Differs from
  // landscape-hero (centred, uppercase) so the two layouts stay distinct.
  const padX = Math.floor(W * 0.06);
  const safe = W - padX * 2;

  const headlineLines = wrap(headline, 32);
  const headlineSz = fitText(longest(headlineLines), safe, Math.floor(H * 0.11), 0.62);
  const lineH = Math.floor(headlineSz * 1.10);

  const subWrapped = wrap(subheadline ?? '', 60);
  const subSz = subWrapped.length
    ? fitText(longest(subWrapped), safe, Math.floor(H * 0.045), 0.55)
    : 0;
  const subLineH = Math.floor(subSz * 1.30);

  const headlineY0 = Math.floor(H * 0.05);
  const subY0      = headlineY0 + headlineLines.length * lineH + Math.floor(H * 0.025);

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="800" fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const subSvg = subWrapped.map((line, i) =>
    `<text x="${padX}" y="${subY0 + i * subLineH + subSz * 0.85}" font-family="Arial,Helvetica,sans-serif"
      font-size="${subSz}" fill="${theme.subheadline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Phone in lower band: native aspect, centred horizontally.
  const textBlockH = headlineLines.length * lineH
    + (subWrapped.length ? Math.floor(H * 0.025) + subWrapped.length * subLineH : 0);
  const phoneTop  = headlineY0 + textBlockH + Math.floor(H * 0.05);
  const bottomPad = Math.floor(H * 0.05);
  const availH    = H - phoneTop - bottomPad;
  const ssAspect  = await screenshotAspect(screenshotPath);   // h/w
  // Fit phone to the available band — clamp to safe width if the screenshot
  // is wide enough that height-driven sizing would overflow.
  const maxPhoneW = W - Math.floor(W * 0.10);
  let phoneH = availH;
  let phoneW = Math.round(phoneH / ssAspect);
  if (phoneW > maxPhoneW) {
    phoneW = maxPhoneW;
    phoneH = Math.round(phoneW * ssAspect);
  }
  const phoneLeft = Math.floor((W - phoneW) / 2);
  const phoneTopFinal = phoneTop + Math.floor((availH - phoneH) / 2);
  const phoneBuf = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf,             top: phoneTopFinal, left: phoneLeft },
      { input: Buffer.from(overlay), top: 0,             left: 0         },
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
