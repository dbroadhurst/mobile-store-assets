import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, stripBrackets, screenshotAspect, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Layout 02 — CAPTION BELOW
// Phone fills the upper canvas, full width with side padding. A bold caption
// (3 lines max) and a substantial subhead sit centered below.
//
// Notes from review (2026-05-08):
//   • Brand wordmark below the phone removed — the App/Play Store already
//     shows the app name next to the screenshot.
//   • Icon below the phone removed — created a heavy bottom block; the
//     caption alone is the right visual weight.
//   • Subheadline upsized so the hierarchy headline → subhead reads cleanly.
export async function captionBelow(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('caption-below requires a screenshot source');

  const headline    = stripBrackets(screenshot.headline);
  const subheadline = screenshot.subheadline;

  // Phone: starts ~5% from top, occupies upper 64% of canvas
  // Phone: width is derived from canvas with side padding; height comes from
  // the screenshot's NATIVE aspect ratio so the screenshot is never clipped
  // or stretched. Wider devices (iPads) get less padding so the wider frame
  // still fits inside the canvas.
  const ssAspect = await screenshotAspect(screenshotPath);
  const isWide   = ssAspect < 1.6;            // iPad / Android tablet
  const sidePad  = Math.floor(W * (isWide ? 0.08 : 0.16));
  const phoneW   = W - sidePad * 2;
  const phoneTop = Math.floor(H * 0.05);
  const phoneH   = Math.round(phoneW * ssAspect);
  // Bezel + corner radius auto-derived inside makeDeviceFrame for a slim,
  // realistic device look (~1.8% of phoneW).
  const phoneBuf = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');

  const cx = W / 2;
  const safe = W * 0.84;

  // Caption (3 lines max)
  const captionY0 = phoneTop + phoneH + Math.floor(H * 0.04);
  const lines = splitCaption(headline);
  const captionSz = fitText(longest(lines), safe, Math.floor(W * 0.062), 0.58);
  // Bumped to 1.30 from 1.18 — capitals need more vertical breathing room.
  const lineH = Math.floor(captionSz * 1.30);

  const captionSvg = lines.map((line, i) =>
    `<text x="${cx}" y="${captionY0 + (i + 1) * lineH}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${captionSz}" font-weight="800"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Subhead — sized for readable hierarchy with a clear gap from the caption
  const subSz = Math.floor(captionSz * 0.62);
  const subY = captionY0 + lines.length * lineH + Math.floor(H * 0.040);
  const subWrapped = wrap(subheadline ?? '', 38);
  const subSvg = subWrapped.map((line, i) =>
    `<text x="${cx}" y="${subY + i * Math.floor(subSz * 1.30)}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${subSz}"
      fill="${theme.subheadline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Text-safe scrim: subtle gradient behind the caption block so geometric /
  // mesh / bokeh backgrounds don't fight the headline.
  const scrimTop = phoneTop + phoneH;
  const scrimH   = H - scrimTop;
  const scrim = `<defs>
    <linearGradient id="captionScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="rgba(0,0,0,0)"/>
      <stop offset="35%" stop-color="rgba(0,0,0,${theme.scrim * 0.55})"/>
      <stop offset="100%" stop-color="rgba(0,0,0,${theme.scrim * 0.55})"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimTop}" width="${W}" height="${scrimH}" fill="url(#captionScrim)"/>`;

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${scrim}
    ${captionSvg}
    ${subSvg}
  </svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf,             top: phoneTop, left: sidePad },
      { input: Buffer.from(overlay), top: 0,        left: 0       },
    ])
    .png()
    .toBuffer();
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}

function splitCaption(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return [words.join(' ')];
  const target = Math.ceil(words.length / 3);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += target) out.push(words.slice(i, i + target).join(' '));
  return out.slice(0, 3);
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
