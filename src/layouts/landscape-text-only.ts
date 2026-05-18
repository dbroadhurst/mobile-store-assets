import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { escapeXml, fitText, resizeBg, stripBrackets, circularCrop, TEXT_SHADOW_DEFS } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// LANDSCAPE-TEXT-ONLY  (CTA closer at landscape)
// No phone. Wide canvas. App icon + headline + subhead, all centred. The
// text-hero equivalent for landscape sets.
export async function landscapeTextOnly(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);

  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const padX = Math.floor(W * 0.07);
  const safe = W - padX * 2;
  const cx = W / 2;

  // Icon top-left of the canvas, vertically centred
  const iconSize = Math.floor(H * 0.55);
  const iconLeft = Math.floor(W * 0.06);
  const iconTop  = Math.floor((H - iconSize) / 2);
  const iconPath = path.join(projectRoot, config.app.icon);
  let iconComposite: sharp.OverlayOptions | null = null;
  if (fs.existsSync(iconPath)) {
    const iconBuf = await circularCrop(await sharp(iconPath).png().toBuffer(), iconSize);
    iconComposite = { input: iconBuf, top: iconTop, left: iconLeft };
  }

  // Headline + subhead right of icon, vertically centred
  const textLeft = iconComposite
    ? iconLeft + iconSize + Math.floor(W * 0.04)
    : Math.floor(W * 0.08);
  const textSafe = W - textLeft - Math.floor(W * 0.05);

  const headlineLines = wrap(headline, 22);
  const headlineSz = fitText(longest(headlineLines), textSafe, Math.floor(H * 0.16), 0.66);
  const lineH = Math.floor(headlineSz * 1.05);

  const subWrapped = wrap(screenshot.subheadline ?? '', 38);
  const subSz = fitText(longest(subWrapped), textSafe, Math.floor(H * 0.06), 0.55);
  const subLineH = Math.floor(subSz * 1.30);

  const blockH = headlineLines.length * lineH + Math.floor(H * 0.04) + subWrapped.length * subLineH;
  const headlineY0 = Math.floor((H - blockH) / 2);
  const subY0      = headlineY0 + headlineLines.length * lineH + Math.floor(H * 0.04);

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${textLeft}" y="${headlineY0 + (i + 1) * lineH}" font-family="Arial,Helvetica,sans-serif"
      font-size="${headlineSz}" font-weight="900" fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const subSvg = subWrapped.map((line, i) =>
    `<text x="${textLeft}" y="${subY0 + i * subLineH + subSz * 0.85}" font-family="Arial,Helvetica,sans-serif"
      font-size="${subSz}" fill="${theme.subheadline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  // Suppress unused warnings
  void cx; void padX; void safe;

  const composites: sharp.OverlayOptions[] = [];
  if (iconComposite) composites.push(iconComposite);
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  const buffer = await sharp(bg).composite(composites).png().toBuffer();

  const headlineBboxes = headlineLines.map((line, i) =>
    estimateTextBbox({
      x: textLeft, y: headlineY0 + (i + 1) * lineH, text: line,
      fontSize: headlineSz, anchor: 'start', charRatio: 0.66,
    }),
  );
  const subBboxes = subWrapped.map((line, i) =>
    estimateTextBbox({
      x: textLeft, y: subY0 + i * subLineH + subSz * 0.85, text: line,
      fontSize: subSz, anchor: 'start', charRatio: 0.55,
    }),
  );
  const zones: TextZone[] = [
    {
      role: 'headline',
      text: headlineLines.join(' '),
      bbox: unionBbox(headlineBboxes),
      color: theme.headline_color,
      fontSize: headlineSz,
      isLargeText: true,
    },
    ...(subWrapped.length > 0 ? [{
      role: 'subheadline' as const,
      text: subWrapped.join(' '),
      bbox: unionBbox(subBboxes),
      color: theme.subheadline_color,
      fontSize: subSz,
      isLargeText: subSz >= Math.floor(H * 0.025),
    }] : []),
  ];

  return { buffer, zones };
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
