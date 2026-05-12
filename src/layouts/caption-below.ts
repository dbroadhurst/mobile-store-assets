import sharp from 'sharp';
import { escapeXml, fitWrapped, makeDeviceFrame, resizeBg, stripBrackets, screenshotAspect, TEXT_SHADOW_DEFS } from '../helpers.js';
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

  // ── Caption area: between phone bottom and canvas bottom ─────────────────
  // Bound caption + subline to the available vertical space so nothing clips
  // the canvas edge. fitWrapped picks the largest font that fits both
  // dimensions and avoids orphan-word line breaks.
  const captionY0 = phoneTop + phoneH + Math.floor(H * 0.04);
  const captionAreaH = H - captionY0 - Math.floor(H * 0.03);  // leave a 3% bottom gutter
  // Captions can use most of the available area, but reserve room for the
  // subline. Allow up to 3 lines for long captions.
  const captionBudgetH = subheadline
    ? Math.floor(captionAreaH * 0.60)
    : Math.floor(captionAreaH * 0.85);
  const caption = fitWrapped(headline, safe, captionBudgetH,
    Math.floor(W * 0.062), 0.58, 1.30, { maxLines: 3, minSize: Math.floor(W * 0.028) });
  const lineH = Math.floor(caption.size * 1.30);
  const totalCaptionH = caption.lines.length * lineH;

  const captionSvg = caption.lines.map((line, i) =>
    `<text x="${cx}" y="${captionY0 + (i + 1) * lineH}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${caption.size}" font-weight="800"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');

  // Subhead — fits in the remaining space below the caption.
  const subGap = Math.floor(H * 0.025);
  const subAreaH = Math.max(0, captionAreaH - totalCaptionH - subGap);
  const sub = subheadline
    ? fitWrapped(subheadline, safe, subAreaH,
        Math.floor(caption.size * 0.62), 0.55, 1.30, { maxLines: 2, minSize: Math.floor(W * 0.020) })
    : { lines: [] as string[], size: 0 };
  const subLineH = sub.size ? Math.floor(sub.size * 1.30) : 0;
  const subY = captionY0 + totalCaptionH + subGap;
  const subSvg = sub.lines.map((line, i) =>
    `<text x="${cx}" y="${subY + (i + 1) * subLineH - Math.floor(subLineH * 0.20)}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${sub.size}"
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

