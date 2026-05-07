import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Phone fills full canvas width and is placed at the bottom of the canvas.
// The phone frame preserves the screenshot's native aspect ratio — no internal crop.
// If the phone is taller than the remaining canvas, the canvas edge clips the bottom.
// Text overlaid at the top with a gradient scrim; always left-aligned.
export async function split(input: LayoutInput, _direction: 'left' | 'right'): Promise<Buffer> {
  const { background, screenshotPath, spec, style, config, targetWidth: W, targetHeight: H } = input;

  const bg = await resizeBg(background, W, H);

  // ── Phone: native aspect ratio, full canvas width ─────────────────────────
  const sidePad = Math.floor(W * 0.03);
  const phoneW  = W - sidePad * 2;
  const frameBorder = Math.max(14, Math.floor(phoneW * 0.032));
  const cornerR     = frameBorder + Math.floor(phoneW * 0.026);

  // Compute natural phone height from the screenshot's own proportions
  const meta      = await sharp(screenshotPath!).metadata();
  const nativeH   = Math.round(phoneW * (meta.height! / meta.width!));

  // Phone starts at 30% down — text sits above it, phone may bleed off the bottom
  const phoneTop    = Math.floor(H * 0.30);
  const maxH        = H - phoneTop;
  const visibleH    = Math.min(nativeH, maxH);

  // Build frame at full native height (fit:'fill' — no internal crop), then
  // extract only the top `visibleH` rows so sharp's composite doesn't overflow
  const fullFrame = await makeDeviceFrame(screenshotPath!, phoneW, nativeH, frameBorder, cornerR, 'top', 'fill');
  const phoneBuf  = nativeH > visibleH
    ? await sharp(fullFrame).extract({ left: 0, top: 0, width: phoneW, height: visibleH }).png().toBuffer()
    : fullFrame;

  // ── Text: always left-anchored in the top zone ────────────────────────────
  const padX = Math.floor(W * 0.08);
  const safe = W - padX * 2;

  const appNameSz  = fitText(config.app.name.toUpperCase(), safe, Math.floor(W * 0.034), 0.62);
  const headlineSz = fitText(spec.headline,    safe, Math.floor(W * 0.095), 0.58);
  const subSz      = fitText(spec.subheadline, safe, Math.floor(W * 0.050), 0.52);

  // Tight vertical cluster — keep text close together, close the gap to the phone
  const nameY     = Math.floor(H * 0.065);
  const headlineY = Math.floor(H * 0.145);
  const subY      = Math.floor(H * 0.225);

  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.72)"/>
      <stop offset="52%"  stop-color="rgba(0,0,0,0.38)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${Math.floor(H * 0.44)}" fill="url(#topScrim)"/>

  <text x="${padX}" y="${nameY}" text-anchor="start" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${appNameSz}" font-weight="400"
    fill="rgba(255,255,255,0.65)" letter-spacing="3">${escapeXml(config.app.name.toUpperCase())}</text>

  <text x="${padX}" y="${headlineY}" text-anchor="start" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="700"
    fill="${style.headline_color}">${escapeXml(spec.headline)}</text>

  <text x="${padX}" y="${subY}" text-anchor="start" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${subSz}" font-weight="400"
    fill="${style.subheadline_color}">${escapeXml(spec.subheadline)}</text>
</svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf,             top: phoneTop, left: sidePad },
      { input: Buffer.from(overlay), top: 0,        left: 0       },
    ])
    .png()
    .toBuffer();
}
