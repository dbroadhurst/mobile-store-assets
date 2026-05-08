import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, parseHeadline, screenshotAspect, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 05 — HIGHLIGHT PILL  (followit)
// Mixed-weight headline with a bright pill behind a [bracketed] keyword.
// Phone tilted slightly center/right.
//
// Headline syntax: "Quickly [FIND FEEDS] that match your interests"
// The bracketed run becomes the highlighted pill.
export async function highlightPill(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('highlight-pill requires a screenshot source');

  const tokens = parseHeadline(screenshot.headline);
  const padX = Math.floor(W * 0.07);
  const safe = W - padX * 2;

  // Render headline as wrapped lines, splitting around the highlight token.
  // Simplified strategy: each token becomes its own line section. The pill
  // wraps any token where highlight=true.
  const headlineSz = fitText(
    tokens.reduce((a, t) => a + t.text.length, 0).toString(),
    safe,
    Math.floor(W * 0.075),
    0.58,
  );
  const lineH = Math.floor(headlineSz * 1.20);

  // Build SVG: lay out tokens left-to-right, wrap on space if line gets long.
  // For simplicity: one token per line for highlighted, others wrap normally.
  // We approximate with three lines based on token boundaries.
  const lines = layoutTokens(tokens, 14);

  // Render mixed-weight headline. Highlighted runs (from [brackets]) are bold
  // and accent-coloured but have NO background pill — the user found the
  // coloured block too heavy. The accent text alone now carries the emphasis.
  let lineY = Math.floor(H * 0.13);
  const headlineSvgParts: string[] = [];

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

  // Tilted phone center-right, lower 60% of canvas. Phone aspect derives from
  // the screenshot's NATIVE ratio (no hardcoded value) so iPad sources render
  // iPad-shaped, iPhone iPhone-shaped, with no clipping.
  const phoneW = Math.floor(W * 0.68);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneRotated = await rotateBuffer(phoneFrame, -3);
  const phoneMeta = await sharp(phoneRotated).metadata();

  const phoneTop  = Math.floor(H * 0.34);
  const phoneLeft = Math.floor((W - phoneMeta.width!) / 2);
  // Clip phone if it would exceed canvas height
  const overflow = phoneTop + phoneMeta.height! - H;
  const phoneFinal = overflow > 0
    ? await sharp(phoneRotated).extract({ left: 0, top: 0, width: phoneMeta.width!, height: H - phoneTop }).png().toBuffer()
    : phoneRotated;

  // Subheadline below headline — wrap + fit so long lines don't clip the canvas.
  const subWrapped = wrap(screenshot.subheadline ?? '', 38);
  const subSz = fitText(longest(subWrapped), safe, Math.floor(W * 0.048), 0.55);
  const subLineH = Math.floor(subSz * 1.30);
  const subY0 = lineY + Math.floor(H * 0.020);
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
  return lines.slice(0, 2);
}

// Group headline tokens into rough lines based on a target chars/line.
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
