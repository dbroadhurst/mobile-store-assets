import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, stripBrackets, screenshotAspect, CARD_SHADOW_FILTER, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 07 — CARD + TILTED PHONE  (Sora)
// White rounded card with caption + trust badge in upper area; tilted phone
// overlaps the card's lower-right corner. Faded watermark text behind everything.
export async function cardTilted(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('card-tilted requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);

  // (App-name watermark removed — the store already shows the name next to
  // every screenshot. The card + tilted phone carry the visual identity.)
  const watermarkSvg = '';

  // Card dimensions and position. Card height is now derived from the actual
  // content height + padding (was a fixed H*0.34 which left huge negative
  // space below the trust badge on long-aspect canvases).
  const cardW = Math.floor(W * 0.78);
  const cardX = Math.floor(W * 0.08);
  const cardY = Math.floor(H * 0.16);
  const cardRadius = Math.floor(W * 0.06);
  const cardPad = Math.floor(W * 0.05);

  // Card content: headline + subhead. (Trust badge removed by default — only
  // shows up if the user explicitly authored badge_count, matching the
  // honesty rules from the SKILL.md guardrails.)
  const headlineLines = wrap(headline, 18);
  const headlineSz = fitText(longest(headlineLines), cardW - cardPad * 2, Math.floor(W * 0.07), 0.58);
  const lineH = Math.floor(headlineSz * 1.15);
  const headlineY0 = cardY + cardPad;
  const headlineH  = headlineLines.length * lineH;

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${cardX + cardPad}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="800" fill="#1A1A2E">${escapeXml(line)}</text>`
  ).join('\n');

  const subSz = Math.floor(headlineSz * 0.55);
  const subLineH = Math.floor(subSz * 1.30);
  const subWrapped = wrap(screenshot.subheadline ?? '', 32);
  const subY  = headlineY0 + headlineH + Math.floor(H * 0.012);
  const subH  = subWrapped.length * subLineH;
  const subSvg = subWrapped.map((line, i) =>
    `<text x="${cardX + cardPad}" y="${subY + i * subLineH + subSz * 0.85}"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}" fill="#5C5170">${escapeXml(line)}</text>`
  ).join('\n');

  // Optional trust badge — rendered only when badge_count is explicitly set.
  let badgeSvg = '';
  let badgeH = 0;
  if (screenshot.badge_count) {
    const badgeY = subY + subH + Math.floor(H * 0.020);
    const badgeLineH = Math.floor(W * 0.045);
    badgeSvg = `
      <text x="${cardX + cardPad}" y="${badgeY}" font-family="Arial,Helvetica,sans-serif"
        font-size="${Math.floor(W * 0.026)}" font-weight="700" fill="#1A1A2E">${escapeXml(screenshot.badge_count)}</text>
      <text x="${cardX + cardPad}" y="${badgeY + badgeLineH}"
        font-family="Arial,Helvetica,sans-serif" font-size="${Math.floor(W * 0.022)}" fill="#5C5170"
        letter-spacing="2">${escapeXml((screenshot.badge_label ?? '').toUpperCase())}</text>`;
    badgeH = badgeLineH * 2 + Math.floor(H * 0.02);
  }

  // Auto-size card to content + padding
  const cardH = cardPad + headlineH + Math.floor(H * 0.012) + subH + badgeH + cardPad;

  // Tilted phone overlapping card lower-right. Phone uses screenshot's native
  // aspect so iPad sources render iPad-shaped, iPhone sources iPhone-shaped.
  const phoneW = Math.floor(W * 0.55);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneRotated = await rotateBuffer(phoneFrame, 8);
  const phoneMeta = await sharp(phoneRotated).metadata();

  // Anchor phone to overlap the card's lower-right corner. Phone top sits at
  // ~60% of the way down the card so the card and phone interlock visibly
  // rather than leaving a gap.
  const phoneTop  = cardY + Math.floor(cardH * 0.60);
  const phoneLeft = Math.floor(W * 0.40);
  const overflow = phoneTop + phoneMeta.height! - H;
  const phoneFinal = overflow > 0
    ? await sharp(phoneRotated).extract({ left: 0, top: 0, width: phoneMeta.width!, height: H - phoneTop }).png().toBuffer()
    : phoneRotated;

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${CARD_SHADOW_FILTER}</defs>
    ${TEXT_SHADOW_DEFS}
    ${watermarkSvg}
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardRadius}"
      fill="#FFFFFF" filter="url(#cardShadow)"/>
    ${headlineSvg}
    ${subSvg}
    ${badgeSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: Buffer.from(overlay), top: 0,        left: 0         },
      { input: phoneFinal,           top: phoneTop, left: phoneLeft },
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
  return lines;
}
