import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { escapeXml, fitText, resizeBg, TEXT_SHADOW_DEFS } from '../helpers.js';
import { estimateTextBbox } from '../contrast-gate.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// ANDROID TV BANNER  (1280×720, 16:9)
// Required for Android TV listings. Composed from app icon + name + tagline,
// styled like the Google Play feature graphic but at TV banner dimensions.
//
// The dispatcher routes android-tv-banner → here regardless of the spec's
// `layout` value (TV banner is a fixed composition, not a layout choice).
export async function tvBanner(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);

  const appName = config.app.name;
  const tagline = screenshot.subheadline ?? '';

  // Icon left side, large
  const iconSize = Math.floor(H * 0.62);
  const iconLeft = Math.floor(W * 0.04);
  const iconTop  = Math.floor((H - iconSize) / 2);

  const iconAbs = path.isAbsolute(config.app.icon)
    ? config.app.icon
    : path.join(projectRoot, config.app.icon);

  let iconLayer: sharp.OverlayOptions | null = null;
  if (fs.existsSync(iconAbs)) {
    const iconRaw = await sharp(iconAbs).resize(iconSize, iconSize, { fit: 'cover' }).png().toBuffer();
    const radius = Math.floor(iconSize * 0.22);
    const mask = Buffer.from(
      `<svg width="${iconSize}" height="${iconSize}"><rect width="${iconSize}" height="${iconSize}" rx="${radius}" ry="${radius}" fill="white"/></svg>`
    );
    const iconBuf = await sharp(iconRaw).ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    iconLayer = { input: iconBuf, top: iconTop, left: iconLeft };
  }

  // Text right of icon, vertically centred
  const textLeft = iconLayer
    ? iconLeft + iconSize + Math.floor(W * 0.04)
    : Math.floor(W * 0.06);
  const safe = W - textLeft - Math.floor(W * 0.05);
  const nameSz = fitText(appName, safe, Math.floor(H * 0.30), 0.60);
  const tagSz  = fitText(tagline, safe, Math.floor(H * 0.13), 0.54);
  const blockH = nameSz + Math.floor(H * 0.04) + tagSz;
  const nameY  = Math.floor((H - blockH) / 2) + Math.floor(nameSz * 0.85);
  const tagY   = nameY + Math.floor(H * 0.04) + tagSz;

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    <text x="${textLeft}" y="${nameY}" dominant-baseline="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${nameSz}" font-weight="800"
      fill="${theme.headline_color}">${escapeXml(appName)}</text>
    <text x="${textLeft}" y="${tagY}" dominant-baseline="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="${tagSz}" font-weight="400"
      fill="${theme.subheadline_color}">${escapeXml(tagline)}</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [];
  if (iconLayer) composites.push(iconLayer);
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  const buffer = await sharp(bg).composite(composites).png().toBuffer();

  const zones: TextZone[] = [
    {
      role: 'headline',
      text: appName,
      bbox: estimateTextBbox({
        x: textLeft, y: nameY, text: appName, fontSize: nameSz,
        anchor: 'start', charRatio: 0.60,
      }),
      color: theme.headline_color,
      fontSize: nameSz,
      isLargeText: true,
    },
    ...(tagline ? [{
      role: 'subheadline' as const,
      text: tagline,
      bbox: estimateTextBbox({
        x: textLeft, y: tagY, text: tagline, fontSize: tagSz,
        anchor: 'start', charRatio: 0.54,
      }),
      color: theme.subheadline_color,
      fontSize: tagSz,
      isLargeText: tagSz >= Math.floor(H * 0.04),
    }] : []),
  ];

  return { buffer, zones };
}
