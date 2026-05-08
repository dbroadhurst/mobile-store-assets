import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, parseHeadline, screenshotAspect, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 08 — DUAL PHONE OVERLAP  (followit)
// Two phones at slight opposing rotations, overlapping. Pill-highlighted
// headline above (using [bracket] syntax). Subheadline at the bottom.
// If `screenshotPathSecondary` isn't provided, both phones reuse the primary.
export async function dualPhoneOverlap(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshotPathSecondary, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('dual-phone-overlap requires a screenshot source');

  const tokens = parseHeadline(screenshot.headline);
  const padX = Math.floor(W * 0.07);
  const safe = W - padX * 2;

  // Headline rendered with optional pill highlight on bracketed words.
  const headlineSz = fitText('PLACEHOLDER', safe, Math.floor(W * 0.075), 0.58);
  const lineH = Math.floor(headlineSz * 1.20);
  const headlineY0 = Math.floor(H * 0.13);

  // Highlighted runs render as bold accent-colour text (no pill background).
  const lines = layoutTokens(tokens, 14);
  const headlineSvgParts: string[] = [];
  let lineY = headlineY0;
  for (const line of lines) {
    let cursorX = padX;
    for (const tok of line) {
      const text = tok.text.trim();
      if (!text) { cursorX += headlineSz * 0.30; continue; }
      const charW = headlineSz * (tok.highlight ? 0.62 : 0.55);
      const textW = text.length * charW;
      const fill = tok.highlight ? theme.accent : theme.headline_color;
      const weight = tok.highlight ? 800 : 500;
      headlineSvgParts.push(
        `<text x="${cursorX}" y="${lineY}" font-family="Arial,Helvetica,sans-serif"
          font-size="${headlineSz}" font-weight="${weight}" fill="${fill}">${escapeXml(text)}</text>`,
      );
      cursorX += textW + headlineSz * 0.20;
    }
    lineY += lineH;
  }

  // Phones: each ~50% canvas wide, opposing rotations, overlapping. Each
  // phone's height is derived from its OWN screenshot's aspect, so a dual-phone
  // composition can mix an iPhone and an iPad source without clipping.
  const phoneW = Math.floor(W * 0.50);
  const backH  = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const backFrame = await makeDeviceFrame(screenshotPath, phoneW, backH);
  const backRotated = await rotateBuffer(backFrame, -6);
  const backMeta = await sharp(backRotated).metadata();

  const frontSourcePath = screenshotPathSecondary ?? screenshotPath;
  const frontH = Math.round(phoneW * await screenshotAspect(frontSourcePath));
  const frontFrame = await makeDeviceFrame(frontSourcePath, phoneW, frontH);
  const frontRotated = await rotateBuffer(frontFrame, 5);
  const frontMeta = await sharp(frontRotated).metadata();

  // Layout: back phone top-left-ish, front phone slightly right and lower
  const backTop  = Math.floor(H * 0.32);
  const backLeft = Math.floor(W * 0.06);
  const frontTop  = Math.floor(H * 0.36);
  const frontLeft = Math.floor(W * 0.42);

  // Clip overflow
  const clipBack = backTop + backMeta.height! - H;
  const backFinal = clipBack > 0
    ? await sharp(backRotated).extract({ left: 0, top: 0, width: backMeta.width!, height: H - backTop }).png().toBuffer()
    : backRotated;
  const clipFront = frontTop + frontMeta.height! - H;
  const frontFinal = clipFront > 0
    ? await sharp(frontRotated).extract({ left: 0, top: 0, width: frontMeta.width!, height: H - frontTop }).png().toBuffer()
    : frontRotated;

  // Subheadline at bottom — wrap + fit so long copy doesn't clip the canvas.
  const subWrapped = wrap(screenshot.subheadline ?? '', 38);
  const subSz = fitText(longest(subWrapped), safe, Math.floor(W * 0.048), 0.55);
  const subLineH = Math.floor(subSz * 1.30);
  const totalSubH = subWrapped.length * subLineH;
  const subY0 = H - Math.floor(H * 0.05) - totalSubH + subSz;
  const subSvg = screenshot.subheadline ? subWrapped.map((line, i) => `
    <text x="${padX}" y="${subY0 + i * subLineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${subSz}" fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('') : '';

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvgParts.join('\n')}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: backFinal,            top: backTop,  left: backLeft  },
      { input: frontFinal,           top: frontTop, left: frontLeft },
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
  return lines.slice(0, 2);
}

function layoutTokens(tokens: { text: string; highlight: boolean }[], targetChars: number) {
  const lines: { text: string; highlight: boolean }[][] = [];
  let current: { text: string; highlight: boolean }[] = [];
  let len = 0;
  for (const tok of tokens) {
    const tlen = tok.text.length;
    if (len + tlen > targetChars && current.length > 0) {
      lines.push(current);
      current = [tok];
      len = tlen;
    } else {
      current.push(tok);
      len += tlen;
    }
  }
  if (current.length) lines.push(current);
  return lines.slice(0, 3);
}
