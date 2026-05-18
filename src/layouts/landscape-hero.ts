import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, screenshotAspect, stripBrackets, TEXT_SHADOW_DEFS } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// LANDSCAPE-HERO
// Phone (or landscape device frame) sits centred and large; headline floats
// above with a subhead beneath. Strong opener for landscape-native apps.
export async function landscapeHero(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('landscape-hero requires a screenshot source');

  const headline = stripBrackets(screenshot.headline).toUpperCase();

  // Headline fills top ~24%
  const padX = Math.floor(W * 0.06);
  const safe = W - padX * 2;
  const headlineLines = wrap(headline, 28);
  const headlineSz = fitText(longest(headlineLines), safe, Math.floor(H * 0.13), 0.66);
  const lineH = Math.floor(headlineSz * 1.05);
  const headlineY0 = Math.floor(H * 0.06);

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${W / 2}" y="${headlineY0 + (i + 1) * lineH}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="900"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Subhead below the headline. Gap is generous so headline descenders don't
  // collide with the subhead at large headline sizes.
  const subSz = Math.floor(H * 0.045);
  const subY  = headlineY0 + headlineLines.length * lineH + Math.floor(H * 0.055);
  const subSvg = screenshot.subheadline ? `
    <text x="${W / 2}" y="${subY}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(screenshot.subheadline)}</text>` : '';

  // Phone: centred, fills the lower 60% of canvas height. Width derived from
  // screenshot's native aspect.
  const ssAspect  = await screenshotAspect(screenshotPath);  // h/w
  const phoneTop  = subY + Math.floor(H * 0.06);
  const phoneH    = H - phoneTop - Math.floor(H * 0.04);
  const phoneW    = Math.round(phoneH / ssAspect);
  const phoneLeft = Math.floor((W - phoneW) / 2);
  const phoneBuf  = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${subSvg}
  </svg>`;

  const buffer = await sharp(bg)
    .composite([
      { input: phoneBuf,             top: phoneTop, left: phoneLeft },
      { input: Buffer.from(overlay), top: 0,        left: 0         },
    ])
    .png()
    .toBuffer();

  const headlineBboxes = headlineLines.map((line, i) =>
    estimateTextBbox({
      x: W / 2, y: headlineY0 + (i + 1) * lineH, text: line,
      fontSize: headlineSz, anchor: 'middle', charRatio: 0.66,
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
    ...(screenshot.subheadline ? [{
      role: 'subheadline' as const,
      text: screenshot.subheadline,
      bbox: estimateTextBbox({
        x: W / 2, y: subY, text: screenshot.subheadline, fontSize: subSz,
        anchor: 'middle', charRatio: 0.55,
      }),
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
  return lines.slice(0, 2);
}
