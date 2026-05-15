import sharp from 'sharp';
import {
  escapeXml, fitText, makeDeviceFrame, resizeBg, stripBrackets,
  screenshotAspect, wrapSmart, TEXT_SHADOW_DEFS,
} from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout — AURORA HERO
//
// A rich radial-gradient mesh (aurora) painted on top of the theme bg, with a
// bright glow centred where the phone sits, an oversized condensed uppercase
// headline anchored top-left, and the phone centred in the lower 60% of the
// canvas. Built for value-slot opener screenshots where the goal is visual
// ambition, not feature explanation — replaces logo-tilted as set B's value.
export async function auroraHero(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const baseBg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('aurora-hero requires a screenshot source');

  // ── Phone — centred, large, anchored in the lower 65% of canvas ───────────
  const phoneW = Math.floor(W * 0.66);
  const phoneH = Math.round(phoneW * await screenshotAspect(screenshotPath));
  const phoneFrame = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneTop  = Math.floor(H * 0.36);
  const phoneLeft = Math.floor((W - phoneW) / 2);
  const phoneBudget = H - phoneTop;
  const phoneFinal = phoneH > phoneBudget
    ? await sharp(phoneFrame).extract({ left: 0, top: 0, width: phoneW, height: phoneBudget }).png().toBuffer()
    : phoneFrame;

  // ── Aurora overlay — three radial gradients in the theme palette ──────────
  // The brightest gradient sits behind the phone (creates a glow halo). Two
  // secondary blobs sit in opposite corners for compositional balance and
  // colour variety. Painted ON TOP of the theme bg with their own alpha, so
  // even on a flat-gradient base bg this layer produces visible depth.
  const auroraSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="aurGlow" cx="50%" cy="58%" r="42%">
        <stop offset="0%"  stop-color="${theme.accent}"   stop-opacity="0.55"/>
        <stop offset="60%" stop-color="${theme.accent}"   stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${theme.accent}"  stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="aurTL" cx="12%" cy="14%" r="55%">
        <stop offset="0%"  stop-color="${theme.secondary}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${theme.secondary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="aurBR" cx="92%" cy="92%" r="55%">
        <stop offset="0%"  stop-color="${theme.primary}"   stop-opacity="0.50"/>
        <stop offset="100%" stop-color="${theme.primary}"  stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="aurVignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="rgba(0,0,0,0.32)"/>
        <stop offset="40%"  stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.22)"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#aurTL)"/>
    <rect width="${W}" height="${H}" fill="url(#aurBR)"/>
    <rect width="${W}" height="${H}" fill="url(#aurGlow)"/>
    <rect width="${W}" height="${H}" fill="url(#aurVignette)"/>
  </svg>`;

  // ── Headline — oversized, ALL-CAPS, tight kerning ─────────────────────────
  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const padX = Math.floor(W * 0.07);
  const safe = W - padX * 2;
  const headlineLines = wrapSmart(headline, 13, 3) ?? [headline];
  // charRatio 0.66 — bold ALL-CAPS with negative tracking sits a touch tighter
  // than the standard 0.68. preferred sz capped at 14% canvas width.
  const headlineSz = fitText(longest(headlineLines), safe, Math.floor(W * 0.14), 0.66);
  const lineH = Math.floor(headlineSz * 1.02);   // tight leading for impact
  const headlineY0 = Math.floor(H * 0.05);
  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${padX}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="900" letter-spacing="-2"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // ── Subhead — wraps to up to 3 lines under the headline ───────────────────
  const subWrapped = wrapSmart(screenshot.subheadline ?? '', 36, 3) ?? [];
  const subSz = subWrapped.length
    ? fitText(longest(subWrapped), safe, Math.floor(W * 0.048), 0.55)
    : 0;
  const subLineH = Math.floor(subSz * 1.30);
  const subY0 = headlineY0 + headlineLines.length * lineH + Math.floor(H * 0.028);
  const subSvg = subWrapped.map((line, i) => `
    <text x="${padX}" y="${subY0 + i * subLineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${subSz}" fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('');

  const textOverlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  return sharp(baseBg)
    .composite([
      { input: Buffer.from(auroraSvg),  top: 0,        left: 0        },
      { input: phoneFinal,              top: phoneTop, left: phoneLeft },
      { input: Buffer.from(textOverlay), top: 0,       left: 0        },
    ])
    .png()
    .toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}
