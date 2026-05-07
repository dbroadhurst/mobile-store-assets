import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Centered phone with gradient header — clean fallback layout.
export async function heroCenter(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, spec, style, targetWidth: W, targetHeight: H } = input;

  const bg = await resizeBg(background, W, H);

  const phoneW = Math.floor(W * 0.82);
  const phoneH = Math.floor(H * 0.72);
  const phoneBuf = await makeDeviceFrame(screenshotPath!, phoneW, phoneH);

  const headerH = Math.floor(H * 0.20);
  const phoneTop = headerH + Math.floor((H - headerH - phoneH) / 2);
  const phoneLeft = Math.floor((W - phoneW) / 2);

  const safe = W * 0.86;
  const titleSz   = fitText(input.config.app.name.toUpperCase(), safe, Math.floor(W * 0.036), 0.62);
  const headlineSz = fitText(spec.headline, safe, Math.floor(W * 0.078), 0.60);
  const subSz      = fitText(spec.subheadline, safe, Math.floor(W * 0.044), 0.54);

  const cx = W / 2;
  const overlay = `<svg width="${W}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.65)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${headerH}" fill="url(#g)"/>
  <text x="${cx}" y="${Math.floor(headerH * 0.22)}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${titleSz}" font-weight="400"
    fill="rgba(255,255,255,0.75)" letter-spacing="4">${escapeXml(input.config.app.name.toUpperCase())}</text>
  <text x="${cx}" y="${Math.floor(headerH * 0.54)}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="700"
    fill="${style.headline_color}">${escapeXml(spec.headline)}</text>
  <text x="${cx}" y="${Math.floor(headerH * 0.80)}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${subSz}" font-weight="400"
    fill="${style.subheadline_color}">${escapeXml(spec.subheadline)}</text>
</svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf, top: phoneTop, left: phoneLeft },
      { input: Buffer.from(overlay), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
