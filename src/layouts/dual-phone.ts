import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { resizeBg, stripBrackets, makeDeviceFrame, screenshotAspect, rotateBuffer, fitWrapped } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { paintContainersSvg, type ContainerZone } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// v2 #7 — DUAL PHONE
// Two phones tilted toward each other (one light theme, one dark via secondary
// source). Headline panel above, optional chip row below.
export async function dualPhone(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshotPathSecondary, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('dual-phone requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);
  const subheadline = screenshot.subheadline;
  const chips = (screenshot.features ?? []).slice(0, 2).filter(Boolean);

  const sidePad = Math.floor(W * 0.05);
  const safe = W - sidePad * 2;
  const zones: ContainerZone[] = [];

  // Top headline panel (merged headline + subhead).
  const headTop = Math.floor(H * 0.05);
  const headAreaH = Math.floor(H * 0.20);
  const headWrap = fitWrapped(headline, safe - Math.floor(W * 0.06), Math.floor(headAreaH * 0.55),
    Math.floor(W * 0.066), 0.6, 1.10, { maxLines: 2, minSize: Math.floor(W * 0.040) });
  const headLineH = Math.floor(headWrap.size * 1.10);
  const headTextLeft = sidePad + Math.floor(W * 0.03);
  const headTextY0 = headTop + Math.floor(headAreaH * 0.20);
  headWrap.lines.forEach((line, i) => {
    const baseline = headTextY0 + (i + 1) * headLineH;
    const bbox = estimateTextBbox({ x: headTextLeft, y: baseline, text: line, fontSize: headWrap.size, anchor: 'start', charRatio: 0.6 });
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
      textX: headTextLeft,
      textY: baseline,
      fontWeight: 900,
      letterSpacing: -0.4,
    });
  });
  if (subheadline) {
    const subSize = Math.floor(headWrap.size * 0.45);
    const subY = headTextY0 + headWrap.lines.length * headLineH + Math.floor(H * 0.020) + subSize;
    const bbox = estimateTextBbox({ x: headTextLeft, y: subY, text: subheadline, fontSize: subSize, anchor: 'start', charRatio: 0.55 });
    zones.push({
      style: 'solid-panel',
      role: 'subheadline',
      text: subheadline,
      bbox,
      color: theme.subheadline_color,
      fontSize: subSize,
      isLargeText: false,
      anchor: 'start',
      textX: headTextLeft,
      textY: subY,
      fontWeight: 500,
    });
  }

  // Two tilted phones below.
  const phoneAreaTop = headTop + headAreaH + Math.floor(H * 0.03);
  const phoneAreaBottom = chips.length > 0 ? H - Math.floor(H * 0.10) : H - Math.floor(H * 0.04);
  const phoneAreaH = phoneAreaBottom - phoneAreaTop;
  const ssAspect = await screenshotAspect(screenshotPath);
  const phoneW = Math.floor(W * 0.46);
  const phoneH = Math.round(phoneW * ssAspect);
  const phoneRaw = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const phoneFront = await rotateBuffer(phoneRaw, -6);

  // Back phone (secondary source if present, else same).
  const backSourcePath = screenshotPathSecondary && fs.existsSync(screenshotPathSecondary)
    ? screenshotPathSecondary
    : screenshotPath;
  const backRaw = await makeDeviceFrame(backSourcePath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const backTilted = await rotateBuffer(backRaw, 6);

  const frontMeta = await sharp(phoneFront).metadata();
  const backMeta = await sharp(backTilted).metadata();
  const frontW = frontMeta.width ?? phoneW;
  const frontH = frontMeta.height ?? phoneH;
  const backW = backMeta.width ?? phoneW;
  const backH = backMeta.height ?? phoneH;
  // Position back phone slightly right + front phone slightly left, overlapping.
  const frontLeft = Math.floor(W * 0.16);
  const frontTop = phoneAreaTop + Math.max(0, Math.floor((phoneAreaH - frontH) / 2));
  const backLeft = Math.floor(W * 0.40);
  const backTop = phoneAreaTop + Math.max(0, Math.floor((phoneAreaH - backH) / 2));

  // Compose phones (back first so front overlaps).
  const bgWithPhones = await sharp(bg)
    .composite([
      { input: backTilted,  top: backTop,  left: backLeft  },
      { input: phoneFront,  top: frontTop, left: frontLeft },
    ])
    .png()
    .toBuffer();

  // Footer chips (optional).
  if (chips.length) {
    const chipSize = Math.floor(W * 0.034);
    const chipH = Math.floor(chipSize * 2.3);
    const padX = chipSize * 0.7;
    const gap = chipSize * 0.6;
    const charW = chipSize * 0.6;
    const chipWidths = chips.map(c => Math.ceil(c.length * charW + padX * 2));
    const rowW = chipWidths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
    const chipY = H - chipH - Math.floor(H * 0.025);
    let xCursor = (W - rowW) / 2;
    chips.forEach((label, i) => {
      const w = chipWidths[i];
      const isAccent = i === chips.length - 1 && chips.length > 1;
      zones.push({
        style: 'chip',
        role: 'badge',
        text: label,
        bbox: { x: xCursor, y: chipY, w, h: chipH },
        color: isAccent ? '#1A2330' : theme.headline_color,
        fontSize: chipSize,
        isLargeText: false,
        anchor: 'middle',
        textX: xCursor + w / 2,
        textY: chipY + Math.floor(chipH * 0.66),
        fillOverride: isAccent ? theme.accent : '#FFFFFF',
        fontWeight: 700,
      });
      xCursor += w + gap;
    });
  }
  void path;

  const overlay = await paintContainersSvg(bgWithPhones, zones, { canvasW: W, canvasH: H });
  const buffer = await sharp(bgWithPhones)
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
  return { buffer, zones: gateZones };
}
