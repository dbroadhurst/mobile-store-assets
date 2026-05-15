import sharp from 'sharp';
import {
  escapeXml, fitText, makeDeviceFrame, resizeBg, rotateBuffer, stripBrackets,
  screenshotAspect, wrapSmart, TEXT_SHADOW_DEFS,
} from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout — EDITORIAL SPLIT
//
// Magazine-cover-style split: oversized display number/word anchored top-left,
// supporting headline and subhead beneath it, a slim accent rule, and a
// slightly tilted phone occupying the right 48% of the canvas. Designed for
// trust-slot screenshots where a single credibility number ("50", "128", "10
// steps") IS the message. Uses `badge_count` when authored; falls back to
// the first significant word of the headline so the layout still works when
// the spec doesn't author a stat.
export async function editorialSplit(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('editorial-split requires a screenshot source');

  const padX = Math.floor(W * 0.06);
  const colSplit = Math.floor(W * 0.50);     // text column ends here
  const textColW = colSplit - padX - Math.floor(W * 0.02);

  // ── Eyebrow (small uppercase tag, rendered as a contrast-guaranteed chip) ──
  // Authored via badge_label, otherwise omitted. Previous version rendered
  // the eyebrow as raw text in `theme.accent`, which could collapse against
  // its background when the accent + bg shared a luminance band (e.g. C's
  // blue accent on a teal-bokeh bg). A chip with accent-fill + white-text
  // is high-contrast on every theme.
  const eyebrow = (screenshot.badge_label ?? '').trim().toUpperCase();
  const eyebrowSz = Math.floor(W * 0.022);
  const eyebrowChipH = Math.floor(eyebrowSz * 2.2);
  const eyebrowPadX  = Math.floor(W * 0.022);
  const eyebrowTextW = eyebrow.length * eyebrowSz * 0.66;
  const eyebrowChipW = Math.floor(eyebrowTextW + eyebrowPadX * 2);
  const eyebrowY     = Math.floor(H * 0.06);
  const eyebrowSvg = eyebrow
    ? `<rect x="${padX}" y="${eyebrowY}" width="${eyebrowChipW}" height="${eyebrowChipH}"
         rx="${Math.floor(eyebrowChipH / 2)}" fill="${theme.accent}"/>
       <text x="${padX + eyebrowPadX}" y="${eyebrowY + Math.floor(eyebrowChipH * 0.68)}"
         font-family="Arial,Helvetica,sans-serif" font-size="${eyebrowSz}" font-weight="800"
         letter-spacing="3" fill="#FFFFFF">${escapeXml(eyebrow)}</text>`
    : '';

  // ── Display word (big number / big single word) ───────────────────────────
  // Uses badge_count if set, otherwise pulls the first significant word from
  // the headline (skipping articles/prepositions).
  const headline = stripBrackets(screenshot.headline);
  const displayWord = (screenshot.badge_count ?? extractDisplayWord(headline)).toString();
  const displaySz = fitText(displayWord, textColW, Math.floor(W * 0.32), 0.62);
  // Measure from the bottom of the eyebrow chip (eyebrowY + chip height) so
  // chip-vs-no-chip layouts both have the same display-word offset.
  const eyebrowBottom = eyebrow ? eyebrowY + eyebrowChipH : eyebrowY;
  const displayY  = eyebrowBottom + Math.floor(H * 0.035) + displaySz;
  const displaySvg = `<text x="${padX}" y="${displayY}" font-family="Arial,Helvetica,sans-serif"
    font-size="${displaySz}" font-weight="900" letter-spacing="-6"
    fill="${theme.headline_color}">${escapeXml(displayWord.toUpperCase())}</text>`;

  // ── Accent rule (slim coloured bar below the display word) ────────────────
  const ruleY  = displayY + Math.floor(H * 0.018);
  const ruleW  = Math.floor(W * 0.10);
  const ruleH  = Math.max(3, Math.floor(W * 0.006));
  const ruleSvg = `<rect x="${padX}" y="${ruleY}" width="${ruleW}" height="${ruleH}" rx="${ruleH / 2}"
    fill="${theme.accent}"/>`;

  // ── Headline (supporting copy below the display word) ─────────────────────
  // If badge_count was used, headline shows the FULL headline (since the
  // display word is independent). If we extracted the display word from the
  // headline, render the REST of the headline so we don't repeat ourselves.
  const headlineRest = screenshot.badge_count
    ? headline
    : headline.replace(new RegExp(`^\\s*${escapeRegex(displayWord)}\\s*`, 'i'), '').trim() || headline;
  const headLines = wrapSmart(headlineRest, 18, 3) ?? [headlineRest];
  const headSz = fitText(longest(headLines), textColW, Math.floor(W * 0.058), 0.58);
  const headLineH = Math.floor(headSz * 1.15);
  const headY0 = ruleY + ruleH + Math.floor(H * 0.028);
  const headSvg = headLines.map((line, i) =>
    `<text x="${padX}" y="${headY0 + (i + 1) * headLineH - Math.floor(headLineH * 0.18)}"
      font-family="Arial,Helvetica,sans-serif" font-size="${headSz}" font-weight="700"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // ── Subhead ───────────────────────────────────────────────────────────────
  const subWrapped = wrapSmart(screenshot.subheadline ?? '', 28, 4) ?? [];
  const subSz = subWrapped.length
    ? fitText(longest(subWrapped), textColW, Math.floor(W * 0.040), 0.55)
    : 0;
  const subLineH = Math.floor(subSz * 1.32);
  const subY0 = headY0 + headLines.length * headLineH + Math.floor(H * 0.030);
  const subSvg = subWrapped.map((line, i) => `
    <text x="${padX}" y="${subY0 + (i + 1) * subLineH - Math.floor(subLineH * 0.25)}"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(line)}</text>`).join('');

  // ── Phone (right half, slight tilt) ───────────────────────────────────────
  const phoneRegionX = colSplit + Math.floor(W * 0.02);
  const phoneRegionW = W - phoneRegionX - padX;
  const aspect       = await screenshotAspect(screenshotPath);
  let phoneW = phoneRegionW;
  let phoneH = Math.round(phoneW * aspect);
  const phoneMaxH = Math.floor(H * 0.86);
  if (phoneH > phoneMaxH) {
    phoneH = phoneMaxH;
    phoneW = Math.round(phoneH / aspect);
  }
  const phoneFrame   = await makeDeviceFrame(screenshotPath, phoneW, phoneH);
  const phoneRotated = await rotateBuffer(phoneFrame, 4);
  const phoneMeta    = await sharp(phoneRotated).metadata();
  const phoneCx      = phoneRegionX + Math.floor(phoneRegionW / 2);
  const phoneLeft    = Math.round(phoneCx - phoneMeta.width! / 2);
  const phoneTop     = Math.floor((H - phoneMeta.height!) / 2);

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${eyebrowSvg}
    ${displaySvg}
    ${ruleSvg}
    ${headSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneRotated,         top: phoneTop, left: phoneLeft },
      { input: Buffer.from(overlay), top: 0,        left: 0         },
    ])
    .png()
    .toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}

const SKIP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'is', 'are', 'be', 'all', 'every', 'your', 'our', 'my',
]);

// Pick the most "displayable" word from a headline — preferably a number
// (e.g. "10 steps" → "10"), otherwise the first non-skip word.
function extractDisplayWord(headline: string): string {
  const words = headline.split(/\s+/).filter(Boolean);
  for (const raw of words) {
    const w = raw.replace(/[.,!?;:]+$/, '');
    if (/^\d/.test(w)) return w;
  }
  for (const raw of words) {
    const w = raw.replace(/[.,!?;:]+$/, '');
    if (!SKIP_WORDS.has(w.toLowerCase())) return w;
  }
  return words[0] ?? headline;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
