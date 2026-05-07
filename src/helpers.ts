import sharp from 'sharp';

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Cap font size so text never overflows `maxWidth`.
// charRatio: estimated avg glyph width as fraction of font size (0.60 bold, 0.52 regular).
export function fitText(text: string, maxWidth: number, preferred: number, charRatio = 0.58): number {
  const maxByWidth = Math.floor(maxWidth / (text.length * charRatio));
  return Math.max(12, Math.min(preferred, maxByWidth));
}

// Clip buffer to rounded corners via SVG mask.
// .ensureAlpha() is required — without it, opaque inputs produce black corner fringing.
export async function roundCorners(buf: Buffer, w: number, h: number, r: number): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`
  );
  return sharp(buf)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// Resize screenshot and wrap it in a dark device frame (bezel + camera pill + home bar).
// cornerR is the OUTER radius of the whole device; inner screen radius = cornerR - borderPx.
export async function makeDeviceFrame(
  screenshotPath: string,
  targetW: number,
  targetH: number,
  borderPx = 12,
  cornerR = 40,
  cropPosition: 'top' | 'centre' | 'bottom' = 'top',
  screenshotFit: 'cover' | 'fill' = 'cover',
): Promise<Buffer> {
  const screenW = targetW - borderPx * 2;
  const screenH = targetH - borderPx * 2;
  const screenCornerR = Math.max(4, cornerR - borderPx);

  // ── Screenshot ─────────────────────────────────────────────────────────────
  const screenContent = await sharp(screenshotPath)
    .resize(screenW, screenH, { fit: screenshotFit, position: cropPosition })
    .png()
    .toBuffer();
  const roundedScreen = await roundCorners(screenContent, screenW, screenH, screenCornerR);

  // ── Bezel details ─────────────────────────────────────────────────────────
  // Camera pill — centered near top of bezel
  const camW  = Math.floor(targetW * 0.12);
  const camH  = Math.max(5, Math.floor(borderPx * 0.28));
  const camX  = Math.floor((targetW - camW) / 2);
  const camY  = Math.max(3, Math.floor(borderPx * 0.28));

  // Home bar — centered near bottom of bezel
  const barW  = Math.floor(targetW * 0.26);
  const barH  = Math.max(3, Math.floor(borderPx * 0.16));
  const barX  = Math.floor((targetW - barW) / 2);
  const barY  = targetH - Math.floor(borderPx * 0.45) - barH;

  const detailsSvg = Buffer.from(
    `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${camX}" y="${camY}" width="${camW}" height="${camH}" rx="${Math.floor(camH / 2)}" fill="#2E2E2E"/>
      <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${Math.floor(barH / 2)}" fill="#363636"/>
    </svg>`
  );

  // ── Assemble: dark bezel + screenshot + details ───────────────────────────
  const assembled = await sharp({
    create: { width: targetW, height: targetH, channels: 3, background: '#1A1A1A' },
  })
  .composite([
    { input: roundedScreen, top: borderPx, left: borderPx },
    { input: detailsSvg,    top: 0,        left: 0        },
  ])
  .png()
  .toBuffer();

  // ── Outer rounded corners ─────────────────────────────────────────────────
  return roundCorners(assembled, targetW, targetH, cornerR);
}

// Resize background buffer to exact canvas size (cover crop from centre).
export async function resizeBg(buf: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buf).resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
}

// Circular crop of an image (for app icons in CTA layout).
export async function circularCrop(buf: Buffer, size: number): Promise<Buffer> {
  const resized = await sharp(buf).resize(size, size, { fit: 'cover' }).png().toBuffer();
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  );
  return sharp(resized)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}
