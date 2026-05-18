import sharp from 'sharp';
import { resizeBg, stripBrackets, makeDeviceFrame, screenshotAspect, rotateBuffer, fitWrapped } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { paintContainersSvg, type ContainerZone } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// v2 #8 — TILTED CARD
// Phone presented inside a tilted floating card (gives a "product photo" feel),
// with a solid-panel headline anchored at the bottom.
export async function tiltedCard(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('tilted-card requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);
  const subheadline = screenshot.subheadline;

  // Tilted card holding the phone (top 70%).
  const ssAspect = await screenshotAspect(screenshotPath);
  const cardPadding = Math.floor(W * 0.03);
  const phoneW = Math.floor(W * 0.62);
  const phoneH = Math.round(phoneW * ssAspect);
  const cardW = phoneW + cardPadding * 2;
  const cardH = phoneH + cardPadding * 2;
  const cardR = Math.floor(cardW * 0.07);

  // Card SVG (white floating card with drop shadow); compose phone inside, then tilt.
  const cardSvg = `<svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
        <feOffset dx="0" dy="6"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.30"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="#FFFFFF" filter="url(#cardShadow)"/>
  </svg>`;
  const phoneBuf = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const cardWithPhone = await sharp(Buffer.from(cardSvg))
    .composite([{ input: phoneBuf, top: cardPadding, left: cardPadding }])
    .png()
    .toBuffer();
  const tilted = await rotateBuffer(cardWithPhone, -4);
  const tiltedMeta = await sharp(tilted).metadata();
  const tiltedW = tiltedMeta.width ?? cardW;
  const tiltedH = tiltedMeta.height ?? cardH;
  const cardTop = Math.floor(H * 0.06);
  const cardLeft = Math.floor((W - tiltedW) / 2);

  // Bottom panel for text.
  const sidePad = Math.floor(W * 0.05);
  const panelW = W - sidePad * 2;
  const panelH = Math.floor(H * 0.22);
  const panelY = H - panelH - Math.floor(H * 0.04);
  const panelX = sidePad;
  const safe = panelW - Math.floor(W * 0.06);
  const textLeft = panelX + Math.floor(W * 0.03);

  const zones: ContainerZone[] = [];
  const headWrap = fitWrapped(headline, safe, Math.floor(panelH * 0.55),
    Math.floor(W * 0.072), 0.6, 1.10, { maxLines: 2, minSize: Math.floor(W * 0.066) });
  const headLineH = Math.floor(headWrap.size * 1.10);
  const headTextY0 = panelY + Math.floor(panelH * 0.18);
  headWrap.lines.forEach((line, i) => {
    const baseline = headTextY0 + (i + 1) * headLineH;
    const bbox = estimateTextBbox({ x: textLeft, y: baseline, text: line, fontSize: headWrap.size, anchor: 'start', charRatio: 0.6 });
    const isAccent = i === headWrap.lines.length - 1 && headWrap.lines.length > 1;
    zones.push({
      style: 'solid-panel',
      role: 'headline',
      text: line,
      bbox,
      color: isAccent ? theme.accent : theme.headline_color,
      fontSize: headWrap.size,
      isLargeText: true,
      anchor: 'start',
      textX: textLeft,
      textY: baseline,
      fontWeight: 900,
      letterSpacing: -0.4,
    });
  });

  if (subheadline) {
    const subBudgetH = panelY + panelH - (headTextY0 + headWrap.lines.length * headLineH) - Math.floor(H * 0.02);
    const subWrap = fitWrapped(subheadline, safe, subBudgetH,
      Math.floor(W * 0.045), 0.55, 1.25, { maxLines: 3, minSize: Math.floor(W * 0.040) });
    const subLineH = Math.floor(subWrap.size * 1.25);
    const subY0 = headTextY0 + headWrap.lines.length * headLineH + Math.floor(H * 0.015);
    subWrap.lines.forEach((line, i) => {
      const baseline = subY0 + (i + 1) * subLineH;
      const bbox = estimateTextBbox({ x: textLeft, y: baseline, text: line, fontSize: subWrap.size, anchor: 'start', charRatio: 0.55 });
      zones.push({
        style: 'solid-panel',
        role: 'subheadline',
        text: line,
        bbox,
        color: theme.subheadline_color,
        fontSize: subWrap.size,
        isLargeText: false,
        anchor: 'start',
        textX: textLeft,
        textY: baseline,
        fontWeight: 400,
      });
    });
  }

  // Compose: bg → tilted card → SVG overlay (panel + text)
  const cardClip = await clipToCanvas(tilted, tiltedW, tiltedH, cardTop, cardLeft, W, H);
  const bgWithCard = cardClip
    ? await sharp(bg).composite([cardClip]).png().toBuffer()
    : bg;
  const overlay = await paintContainersSvg(bgWithCard, zones, { canvasW: W, canvasH: H });
  const buffer = await sharp(bgWithCard)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const gateZones: TextZone[] = [];
  const headZones = zones.filter(z => z.role === 'headline');
  if (headZones.length) {
    gateZones.push({
      role: 'headline',
      text: headZones.map(z => z.text).join(' '),
      bbox: unionBbox(headZones.map(z => z.bbox)),
      color: headZones[0].color,
      fontSize: headZones[0].fontSize,
      isLargeText: true,
    });
  }
  const subZones = zones.filter(z => z.role === 'subheadline');
  if (subZones.length) {
    gateZones.push({
      role: 'subheadline',
      text: subZones.map(z => z.text).join(' '),
      bbox: unionBbox(subZones.map(z => z.bbox)),
      color: subZones[0].color,
      fontSize: subZones[0].fontSize,
      isLargeText: subZones[0].isLargeText,
    });
  }
  void panelX;
  return { buffer, zones: gateZones };
}

async function clipToCanvas(
  buf: Buffer, bufW: number, bufH: number,
  top: number, left: number, canvasW: number, canvasH: number,
): Promise<sharp.OverlayOptions | null> {
  const x0 = Math.max(left, 0);
  const y0 = Math.max(top, 0);
  const x1 = Math.min(left + bufW, canvasW);
  const y1 = Math.min(top + bufH, canvasH);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === left && y0 === top && x1 === left + bufW && y1 === top + bufH) {
    return { input: buf, top, left };
  }
  const cropped = await sharp(buf)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input: cropped, top: y0, left: x0 };
}
