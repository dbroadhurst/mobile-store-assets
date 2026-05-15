import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, stripBrackets, screenshotAspect, CARD_SHADOW_FILTER, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 07 — CARD + TILTED PHONE  (Sora)
// Wide white rounded card with caption (and optional trust badge); tilted
// phone is anchored BELOW the card and overlaps just the card's bottom-
// padding strip on the lower-right. Text uses the full card width and is
// never covered by the screenshot.
export async function cardTilted(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('card-tilted requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);

  // (App-name watermark removed — the store already shows the name next to
  // every screenshot. The card + tilted phone carry the visual identity.)
  const watermarkSvg = '';

  // Card dimensions and position. Card height is derived from the actual
  // content height + padding so the card never has dead space below the copy.
  const cardW = Math.floor(W * 0.78);
  const cardX = Math.floor(W * 0.08);
  const cardY = Math.floor(H * 0.13);
  const cardRadius = Math.floor(W * 0.06);
  const cardPad = Math.floor(W * 0.05);
  const textLeft = cardX + cardPad;
  const textColW = cardW - cardPad * 2;

  // Card content: headline + subhead. (Trust badge removed by default — only
  // shows up if the user explicitly authored badge_count, matching the
  // honesty rules from the SKILL.md guardrails.)
  const headlineLines = wrap(headline, 18);
  const headlineSz = fitText(longest(headlineLines), textColW, Math.floor(W * 0.07), 0.58);
  const lineH = Math.floor(headlineSz * 1.15);
  const headlineY0 = cardY + cardPad;
  const headlineH  = headlineLines.length * lineH;

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${textLeft}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="800" fill="#1A1A2E">${escapeXml(line)}</text>`
  ).join('\n');

  const subSzMax = Math.floor(headlineSz * 0.55);
  const subWrapped = wrap(screenshot.subheadline ?? '', 32);
  const subSz = subWrapped.length
    ? fitText(longest(subWrapped), textColW, subSzMax, 0.54)
    : subSzMax;
  const subLineH = Math.floor(subSz * 1.30);
  const subY  = headlineY0 + headlineH + Math.floor(H * 0.012);
  const subH  = subWrapped.length * subLineH;
  const subSvg = subWrapped.map((line, i) =>
    `<text x="${textLeft}" y="${subY + i * subLineH + subSz * 0.85}"
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

  // Tilted phone anchored BELOW the card, slightly right-of-centre. Phone
  // uses screenshot's native aspect so iPad sources render iPad-shaped,
  // iPhone sources iPhone-shaped. Sized a touch smaller than the previous
  // overlap version so its bottom doesn't crop excessively when the card is
  // tall (long copy).
  const phoneW = Math.floor(W * 0.50);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneRotated = await rotateBuffer(phoneFrame, 8);
  const phoneMeta = await sharp(phoneRotated).metadata();

  // Phone top sits inside the card's bottom-padding strip — the phone's
  // rotated bbox tucks just under the text, so the corner interlock with the
  // card stays visible without any chance of covering copy.
  const phoneTop  = cardY + cardH - Math.floor(cardPad * 0.6);
  const phoneLeft = Math.floor(W * 0.38);
  const overflow = phoneTop + phoneMeta.height! - H;
  const phoneFinal = overflow > 0
    ? await sharp(phoneRotated).extract({ left: 0, top: 0, width: phoneMeta.width!, height: H - phoneTop }).png().toBuffer()
    : phoneRotated;

  // Left accent bar — unambiguous design pattern (priority indicator /
  // category marker), sized cardPad*0.30 wide and inset slightly from the
  // card's rounded top + bottom corners so it reads as part of the card
  // rather than an artifact. Replaces an earlier top-strip + wash that
  // reviewers reported as confusing ("don't understand the top of the card").
  const barW    = Math.floor(cardPad * 0.22);
  const barX    = cardX + Math.floor(cardPad * 0.32);
  const barInset = Math.floor(cardRadius * 0.55);
  const barY    = cardY + barInset;
  const barH    = cardH - barInset * 2;
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${CARD_SHADOW_FILTER}</defs>
    ${TEXT_SHADOW_DEFS}
    ${watermarkSvg}
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cardRadius}"
      fill="#FFFFFF" filter="url(#cardShadow)"/>
    <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${Math.floor(barW / 2)}"
      fill="${theme.accent}"/>
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
