import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { escapeXml, fitText, resizeBg, circularCrop } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// No phone — pure brand image: app icon, name, tagline, optional feature bullets, accent line.
export async function cta(input: LayoutInput, projectRoot: string): Promise<Buffer> {
  const { background, spec, style, config, targetWidth: W, targetHeight: H } = input;

  const bg = await resizeBg(background, W, H);
  const cx = W / 2;

  // ── Sizes ─────────────────────────────────────────────────────────────────
  const iconSize  = Math.floor(W * 0.24);
  const safe      = W * 0.78;
  const appNameSz = fitText(spec.headline,    safe, Math.floor(W * 0.100), 0.58);
  const subSz     = fitText(spec.subheadline, safe, Math.floor(W * 0.052), 0.52);

  const features  = spec.features ?? [];
  const longestFeature = features.reduce((a, b) => a.length > b.length ? a : b, '');
  const featureSz = features.length > 0
    ? fitText(`▸  ${longestFeature}`, safe * 0.82, Math.floor(W * 0.044), 0.52)
    : 0;

  // ── Vertical group heights ─────────────────────────────────────────────────
  const iconGap      = Math.floor(H * 0.048);
  const nameHeight   = Math.floor(appNameSz * 1.2);
  const nameGap      = Math.floor(H * 0.028);
  const subHeight    = Math.floor(subSz * 1.2);
  const featuresGap  = features.length > 0 ? Math.floor(H * 0.032) : 0;
  const featureLineH = features.length > 0 ? Math.floor(featureSz * 1.65) : 0;
  const featuresH    = features.length > 0 ? featuresGap + features.length * featureLineH : 0;
  const lineGap      = Math.floor(H * 0.032);
  const lineH        = 4;

  const totalH   = iconSize + iconGap + nameHeight + nameGap + subHeight + featuresH + lineGap + lineH;
  const groupTop = Math.floor(H * 0.47 - totalH / 2);

  // ── Y positions ───────────────────────────────────────────────────────────
  const iconTop       = groupTop;
  const nameY         = iconTop + iconSize + iconGap + Math.floor(nameHeight / 2);
  const subY          = nameY + Math.floor(nameHeight / 2) + nameGap + Math.floor(subHeight / 2);
  const firstFeatureY = subY + Math.floor(subHeight / 2) + featuresGap + Math.floor(featureLineH / 2);
  const lineY         = (features.length > 0
    ? firstFeatureY + (features.length - 1) * featureLineH + Math.floor(featureLineH / 2)
    : subY + Math.floor(subHeight / 2)) + lineGap;

  const iconLeft = cx - Math.floor(iconSize / 2);
  const lineW    = Math.floor(W * 0.14);

  // ── App icon ──────────────────────────────────────────────────────────────
  const iconPath = path.join(projectRoot, config.app.icon);
  let iconComposite: sharp.OverlayOptions | null = null;

  if (fs.existsSync(iconPath)) {
    const iconBuf = await circularCrop(
      await sharp(iconPath).png().toBuffer(),
      iconSize,
    );
    iconComposite = { input: iconBuf, top: iconTop, left: iconLeft };
  }

  // ── Scrim ─────────────────────────────────────────────────────────────────
  const scrimW = Math.floor(W * 0.90);
  const scrimH = Math.floor(totalH * 1.30);
  const scrimY = groupTop - Math.floor(totalH * 0.15);

  // ── Feature bullet SVG snippets ───────────────────────────────────────────
  const featureSvg = features.map((f, i) => {
    const fy = firstFeatureY + i * featureLineH;
    const bulletSz = Math.floor(featureSz * 0.72);
    return `<text x="${cx}" y="${fy}" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial,Helvetica,sans-serif">
      <tspan font-size="${bulletSz}" fill="${style.accent_color}">▸</tspan>
      <tspan dx="10" font-size="${featureSz}" font-weight="300" fill="rgba(255,255,255,0.90)">${escapeXml(f)}</tspan>
    </text>`;
  }).join('\n');

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="vgTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="rgba(0,0,0,0.50)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <linearGradient id="vgBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
    </linearGradient>
    <radialGradient id="scrim" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.45)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${Math.floor(H * 0.32)}" fill="url(#vgTop)"/>
  <rect y="${Math.floor(H * 0.68)}" width="${W}" height="${Math.floor(H * 0.32)}" fill="url(#vgBot)"/>

  <ellipse cx="${cx}" cy="${scrimY + Math.floor(scrimH / 2)}"
    rx="${Math.floor(scrimW / 2)}" ry="${Math.floor(scrimH / 2)}"
    fill="url(#scrim)"/>

  <text x="${cx}" y="${nameY}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${appNameSz}" font-weight="700"
    fill="${style.headline_color}">${escapeXml(spec.headline)}</text>

  <text x="${cx}" y="${subY}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${subSz}" font-weight="400"
    fill="${style.subheadline_color}">${escapeXml(spec.subheadline)}</text>

  ${featureSvg}

  <rect x="${cx - Math.floor(lineW / 2)}" y="${lineY}" width="${lineW}" height="${lineH}"
    rx="2" fill="${style.accent_color}" opacity="0.90"/>
</svg>`;

  const composites: sharp.OverlayOptions[] = [];
  if (iconComposite) composites.push(iconComposite);
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  return sharp(bg).composite(composites).png().toBuffer();
}
