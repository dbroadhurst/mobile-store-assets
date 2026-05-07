import sharp from 'sharp';
import { escapeXml, fitText, makeDeviceFrame, resizeBg, roundCorners } from '../helpers.js';
import type { LayoutInput } from '../types.js';

// Phone positioned lower-left; a zoomed extract of a UI region floats top-right.
// The juxtaposition draws the eye to the most interesting part of the screen.
export async function featureCallout(input: LayoutInput): Promise<Buffer> {
  const { background, screenshotPath, spec, style, config, targetWidth: W, targetHeight: H } = input;

  const bg = await resizeBg(background, W, H);

  // ── Phone (lower-left, slightly offset) ──────────────────────────────────
  const phoneH = Math.floor(H * 0.75);
  const phoneW = Math.floor(phoneH * 0.48); // ~9:19 phone ratio
  const phoneLeft = Math.floor(W * 0.04);
  const phoneTop  = H - phoneH - Math.floor(H * 0.02);

  const phoneBuf = await makeDeviceFrame(screenshotPath!, phoneW, phoneH);

  // ── Callout extract (top-right) ───────────────────────────────────────────
  const calloutBuf = await makeCallout(screenshotPath!, spec, W, H, style.accent_color);

  // Size and position the callout: right side, vertically centred in upper half
  const calloutW = Math.floor(W * 0.48);
  const calloutMeta = await sharp(calloutBuf).metadata();
  const calloutH = Math.floor(calloutW * (calloutMeta.height! / calloutMeta.width!));
  const calloutLeft = W - calloutW - Math.floor(W * 0.04);
  const calloutTop  = Math.floor(H * 0.12);

  const resizedCallout = await sharp(calloutBuf)
    .resize(calloutW, calloutH, { fit: 'fill' })
    .png()
    .toBuffer();

  // ── Text (top-left, above the phone) ─────────────────────────────────────
  const textAreaH = Math.floor(phoneTop * 0.85);
  const padX      = Math.floor(W * 0.06);
  const safe      = Math.floor(W * 0.52) - padX; // left half minus padding

  const appNameSz  = fitText(config.app.name.toUpperCase(), safe, Math.floor(W * 0.028), 0.62);
  const headlineSz = fitText(spec.headline,    safe, Math.floor(W * 0.068), 0.60);
  const subSz      = fitText(spec.subheadline, safe, Math.floor(W * 0.038), 0.54);

  const nameY     = Math.floor(textAreaH * 0.18);
  const headlineY = Math.floor(textAreaH * 0.46);
  const subY      = Math.floor(textAreaH * 0.72);

  const textOverlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="rgba(0,0,0,0.60)"/>
      <stop offset="40%" stop-color="rgba(0,0,0,0.15)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${Math.floor(H * 0.55)}" fill="url(#tg)"/>

  <text x="${padX}" y="${nameY}" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${appNameSz}" font-weight="400"
    fill="rgba(255,255,255,0.70)" letter-spacing="3">${escapeXml(config.app.name.toUpperCase())}</text>

  <text x="${padX}" y="${headlineY}" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="700"
    fill="${style.headline_color}">${escapeXml(spec.headline)}</text>

  <text x="${padX}" y="${subY}" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${subSz}" font-weight="400"
    fill="${style.subheadline_color}">${escapeXml(spec.subheadline)}</text>
</svg>`;

  return sharp(bg)
    .composite([
      { input: phoneBuf,               top: phoneTop,    left: phoneLeft    },
      { input: resizedCallout,         top: calloutTop,  left: calloutLeft  },
      { input: Buffer.from(textOverlay), top: 0,         left: 0            },
    ])
    .png()
    .toBuffer();
}

// Extract and style the callout region from the screenshot.
async function makeCallout(
  screenshotPath: string,
  spec: LayoutInput['spec'],
  W: number,
  _H: number,
  accentColor: string,
): Promise<Buffer> {
  const meta = await sharp(screenshotPath).metadata();
  const ssW = meta.width!;
  const ssH = meta.height!;

  // Use spec callout coords if provided, else extract centre-upper third
  const c = spec.callout ?? { x: 0.05, y: 0.12, width: 0.90, height: 0.40 };

  const left   = Math.floor(c.x      * ssW);
  const top    = Math.floor(c.y      * ssH);
  const width  = Math.floor(c.width  * ssW);
  const height = Math.floor(c.height * ssH);

  const extracted = await sharp(screenshotPath)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  // White border + accent-colored outer ring
  const borderW  = Math.floor(W * 0.005);
  const accentW  = Math.floor(W * 0.003);
  const totalBorder = borderW + accentW;

  const withWhiteBorder = await sharp(extracted)
    .extend({ top: borderW, bottom: borderW, left: borderW, right: borderW, background: '#FFFFFF' })
    .png()
    .toBuffer();

  const withBorder = await sharp(withWhiteBorder)
    .extend({ top: accentW, bottom: accentW, left: accentW, right: accentW, background: accentColor })
    .png()
    .toBuffer();

  const finalW = width + totalBorder * 2;
  const finalH = height + totalBorder * 2;
  return roundCorners(withBorder, finalW, finalH, Math.floor(W * 0.018));
}
