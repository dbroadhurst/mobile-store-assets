import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { escapeXml, fitText, resizeBg, stripBrackets, circularCrop, TEXT_SHADOW_DEFS } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// WEAR OS  (384×384, 1:1)
// Phone-screenshot layouts don't make sense at watch size. This composition
// is intentionally simple: large centred icon + short app name (3-4 chars max)
// + a single-word headline if it fits. Anything more is illegible at 384px.
//
// The dispatcher routes wear-os → here regardless of the spec's `layout` value.
export async function wearOs(input: LayoutInput): Promise<Buffer> {
  const { background, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);

  const headline = stripBrackets(screenshot.headline);
  // First word only — the rest won't fit
  const word = headline.split(/\s+/).filter(Boolean)[0] ?? '';

  const iconSize = Math.floor(W * 0.42);
  const iconY    = Math.floor(H * 0.18);
  const cx = W / 2;

  const iconPath = path.join(projectRoot, config.app.icon);
  let iconComposite: sharp.OverlayOptions | null = null;
  if (fs.existsSync(iconPath)) {
    const iconBuf = await circularCrop(await sharp(iconPath).png().toBuffer(), iconSize);
    iconComposite = { input: iconBuf, top: iconY, left: Math.floor(cx - iconSize / 2) };
  }

  const wordSz = fitText(word, W * 0.85, Math.floor(W * 0.16), 0.62);
  const wordY  = iconY + iconSize + Math.floor(H * 0.10);

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    <text x="${cx}" y="${wordY}" text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${wordSz}" font-weight="800"
      fill="${theme.headline_color}">${escapeXml(word)}</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];
  if (iconComposite) composites.push(iconComposite);
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  return sharp(bg).composite(composites).png().toBuffer();
}
