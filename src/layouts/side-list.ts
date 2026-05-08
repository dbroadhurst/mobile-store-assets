import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, stripBrackets, screenshotAspect, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 06 — SIDE CATEGORY LIST  (followit)
// Vertical pill list down the left edge, phone occupying right ~60% of canvas.
// Categories come from `screenshot.features`. Falls back to a generic
// "Feature 1..N" if no features were authored.
export async function sideList(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('side-list requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);
  const features = screenshot.features?.length
    ? screenshot.features
    : ['Feature One', 'Feature Two', 'Feature Three', 'Feature Four', 'Feature Five'];

  const padX = Math.floor(W * 0.06);
  const safe = W * 0.4;

  // Headline (top-left)
  const headlineLines = wrap(headline, 16);
  const headlineSz = fitText(longest(headlineLines), safe, Math.floor(W * 0.052), 0.58);
  const lineH = Math.floor(headlineSz * 1.20);
  const headlineY0 = Math.floor(H * 0.11);
  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="800" fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Category pills (left column)
  const pillSz   = Math.floor(W * 0.028);
  const pillW    = Math.floor(W * 0.36);
  const pillH    = Math.floor(W * 0.07);
  const pillGap  = Math.floor(pillH * 0.25);
  const pillsY0  = headlineY0 + headlineLines.length * lineH + Math.floor(H * 0.04);

  const pillsSvg = features.slice(0, 8).map((feat, i) => {
    const y = pillsY0 + i * (pillH + pillGap);
    return `<rect x="${padX}" y="${y}" width="${pillW}" height="${pillH}" rx="${Math.floor(pillH / 2)}" fill="#FFFFFF" opacity="0.96"/>
      <text x="${padX + Math.floor(pillW * 0.08)}" y="${y + Math.floor(pillH * 0.65)}"
        font-family="Arial,Helvetica,sans-serif" font-size="${pillSz}" font-weight="600"
        fill="#1A1A1A">${escapeXml(feat)}</text>`;
  }).join('\n');

  // Phone right side, slight tilt, partially clipped at bottom.
  // Phone aspect is driven by the screenshot's NATIVE ratio so iPad sources
  // render iPad-shaped, iPhone iPhone-shaped (the screenshot is the source of
  // truth for size and aspect — no hardcoded ratios).
  const phoneW = Math.floor(W * 0.52);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneRotated = await rotateBuffer(phoneFrame, -2);
  const phoneMeta = await sharp(phoneRotated).metadata();

  const phoneTop  = Math.floor(H * 0.22);
  const phoneLeft = W - phoneMeta.width! + Math.floor(W * 0.02);
  const overflow = phoneTop + phoneMeta.height! - H;
  const phoneFinal = overflow > 0
    ? await sharp(phoneRotated).extract({ left: 0, top: 0, width: phoneMeta.width!, height: H - phoneTop }).png().toBuffer()
    : phoneRotated;

  // Subheadline anchored just below the lower of (phone bottom, list bottom)
  // — was floating at H*0.95 absolute which felt detached. Wrap + fit so long
  // lines don't clip the canvas.
  const subWrapped = wrap(screenshot.subheadline ?? '', 36);
  const subSz = fitText(longest(subWrapped), W * 0.86, Math.floor(W * 0.048), 0.55);
  const subLineH = Math.floor(subSz * 1.30);
  const phoneBottom = phoneTop + (phoneFinal === phoneRotated ? phoneMeta.height! : H - phoneTop);
  const listBottom  = pillsY0 + features.slice(0, 8).length * (pillH + pillGap);
  const subY = Math.min(H - Math.floor(H * 0.04) - (subWrapped.length - 1) * subLineH,
                        Math.max(phoneBottom, listBottom) + Math.floor(H * 0.04));
  const subSvg = screenshot.subheadline ? subWrapped.map((line, i) => `
    <text x="${padX}" y="${subY + i * subLineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${subSz}" fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('') : '';

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${pillsSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneFinal,           top: phoneTop, left: phoneLeft },
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
