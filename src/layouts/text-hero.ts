import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { escapeXml, fitText, resizeBg, stripBrackets, circularCrop, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 01 — TEXT HERO
// No phone. Centred app icon (large), big left-aligned headline, subhead, and
// an optional row of "feature pills" — short, factual claims about the app
// (e.g. "Free", "No Sign-up", "Offline"). The pill row replaces the previous
// star-rating + review-count UI which encouraged fake claims.
//
// Use it as the closing CTA slot. Pills come from `screenshot.features`; if
// `features` is empty the badge area is omitted and the headline + subhead
// expand to fill the freed vertical space.
export async function textHero(input: LayoutInput): Promise<Buffer> {
  const { background, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);

  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const padX = Math.floor(W * 0.08);
  const safe = W - padX * 2;
  const cx = W / 2;

  // ── Icon (centred, large — the brand anchor) ─────────────────────────────
  // Bumped from 0.18 → 0.24 — text-hero is no-phone, the icon needs to carry
  // visual weight on its own.
  const iconSize = Math.floor(W * 0.24);
  const iconY    = Math.floor(H * 0.08);
  const iconPath = path.join(projectRoot, config.app.icon);
  let iconComposite: sharp.OverlayOptions | null = null;
  if (fs.existsSync(iconPath)) {
    const iconBuf = await circularCrop(await sharp(iconPath).png().toBuffer(), iconSize);
    iconComposite = { input: iconBuf, top: iconY, left: Math.floor(cx - iconSize / 2) };
  }

  // ── Headline ─────────────────────────────────────────────────────────────
  const lines = wrapHeadline(headline, 12);
  // charRatio 0.68 — bold ALL-CAPS Helvetica is wider than mixed-case
  const headlineSz = fitText(longestLine(lines), safe, Math.floor(W * 0.155), 0.68);
  const lineHeight = Math.floor(headlineSz * 1.05);
  const headlineY0 = iconY + iconSize + Math.floor(H * 0.04);

  // ── Subhead ──────────────────────────────────────────────────────────────
  const subLines = wrapSubheadline(screenshot.subheadline, 32);
  const subSz = fitText(longestLine(subLines), safe, Math.floor(W * 0.055), 0.54);
  const subLineH = Math.floor(subSz * 1.25);
  const subY0 = headlineY0 + lines.length * lineHeight + Math.floor(H * 0.030);

  // ── Feature pills (honest claims; optional) ──────────────────────────────
  const pills = (screenshot.features ?? []).filter(Boolean).slice(0, 4);
  const pillSz   = Math.floor(W * 0.034);
  const pillH    = Math.floor(pillSz * 2.4);
  const pillsY0  = subY0 + subLines.length * subLineH + Math.floor(H * 0.045);

  let pillsSvg = '';
  if (pills.length > 0) {
    // Lay out pills in a flowing row, centred. Long lists wrap to a second row.
    const charW = pillSz * 0.55;
    const padX2 = pillSz * 0.7;
    const gap   = pillSz * 0.6;
    type PillRow = { width: number; pills: { text: string; w: number }[] };
    const rows: PillRow[] = [{ width: 0, pills: [] }];
    for (const p of pills) {
      const w = p.length * charW + padX2 * 2;
      const last = rows[rows.length - 1];
      const nextWidth = last.pills.length ? last.width + gap + w : w;
      if (nextWidth > safe && last.pills.length > 0) {
        rows.push({ width: w, pills: [{ text: p, w }] });
      } else {
        last.pills.push({ text: p, w });
        last.width = nextWidth;
      }
    }
    const rowGap = Math.floor(pillH * 0.4);
    const parts: string[] = [];
    rows.forEach((row, ri) => {
      const rowY = pillsY0 + ri * (pillH + rowGap);
      let xCursor = cx - row.width / 2;
      for (const p of row.pills) {
        parts.push(
          `<rect x="${Math.round(xCursor)}" y="${rowY}" width="${Math.round(p.w)}" height="${pillH}"
            rx="${Math.floor(pillH / 2)}" fill="rgba(255,255,255,0.16)"
            stroke="rgba(255,255,255,0.32)" stroke-width="1"/>`,
          `<text x="${Math.round(xCursor + p.w / 2)}" y="${rowY + Math.floor(pillH * 0.65)}"
            text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${pillSz}"
            font-weight="600" fill="${theme.headline_color}">${escapeXml(p.text)}</text>`,
        );
        xCursor += p.w + gap;
      }
    });
    pillsSvg = parts.join('\n');
  }

  // Compose SVG overlay
  const headlineSvg = lines.map((line, i) =>
    `<text x="${cx}" y="${headlineY0 + (i + 1) * lineHeight}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="900"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const subSvg = subLines.map((line, i) =>
    `<text x="${cx}" y="${subY0 + (i + 1) * subLineH}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
    ${pillsSvg}
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];
  if (iconComposite) composites.push(iconComposite);
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  return sharp(bg).composite(composites).png().toBuffer();
}

// ── helpers ──────────────────────────────────────────────────────────────────

function longestLine(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}

function wrapHeadline(text: string, targetCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > targetCharsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function wrapSubheadline(text: string, targetCharsPerLine: number): string[] {
  const segments = text.split(/[,.]\s+/).filter(Boolean);
  if (segments.length > 1 && segments.every(s => s.length <= targetCharsPerLine + 8)) {
    return segments.slice(0, 3);
  }
  return wrapHeadline(text, targetCharsPerLine).slice(0, 3);
}
