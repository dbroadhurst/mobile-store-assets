import sharp from 'sharp';
import { resizeBg, stripBrackets, makeDeviceFrame, screenshotAspect, fitWrapped } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { paintContainersSvg, type ContainerZone } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// v2 #5 — VERTICAL BENTO
// Three vertical bands: headline strip top, full-width phone card middle, two
// equal stat tiles bottom. Stat tiles ("SPEED 3s per entry", "PRIVATE 100% on
// device") use the screenshot.features list — expected format:
//   features: ["SPEED|3s|per entry", "PRIVATE|100%|on device"]
// Pipe-separated to parse cleanly.
export async function verticalBento(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('vertical-bento requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);
  const stats = (screenshot.features ?? []).slice(0, 2).map(parseStat);

  const sidePad = Math.floor(W * 0.06);
  const safe = W - sidePad * 2;
  const zones: ContainerZone[] = [];

  // Top headline strip — solid-panel.
  const headTop = Math.floor(H * 0.04);
  const headH = Math.floor(H * 0.14);
  const headWrap = fitWrapped(headline, safe - Math.floor(W * 0.06), Math.floor(headH * 0.7),
    Math.floor(W * 0.062), 0.6, 1.10, { maxLines: 2, minSize: Math.floor(W * 0.040) });
  const headLineH = Math.floor(headWrap.size * 1.10);
  const headTextLeft = sidePad + Math.floor(W * 0.03);
  const headTextY0 = headTop + Math.floor(headH * 0.18);

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

  // Middle: full-width phone card (white tile).
  const ssAspect = await screenshotAspect(screenshotPath);
  const phoneAreaTop = headTop + headH + Math.floor(H * 0.025);
  const phoneAreaH = Math.floor(H * 0.50);
  const phoneTilePadX = Math.floor(W * 0.05);
  const phoneTileW = W - sidePad * 2;
  const phoneInnerW = phoneTileW - phoneTilePadX * 2;
  const phoneInnerH = Math.round(phoneInnerW * ssAspect);
  const phoneTop = phoneAreaTop + Math.floor((phoneAreaH - phoneInnerH) / 2);
  const phoneBuf = await makeDeviceFrame(screenshotPath, phoneInnerW, phoneInnerH, 0, 0, 'top', 'cover');

  // Bottom: 2 stat tiles.
  const statTop = phoneAreaTop + phoneAreaH + Math.floor(H * 0.025);
  const statH = H - statTop - Math.floor(H * 0.03);
  const statGap = Math.floor(W * 0.025);
  const statW = Math.floor((W - sidePad * 2 - statGap) / 2);

  stats.forEach((stat, i) => {
    const tileX = sidePad + i * (statW + statGap);
    const tileBbox = { x: tileX, y: statTop, w: statW, h: statH };
    const isAccent = i === 1 && stats.length > 1;
    const innerPad = Math.floor(W * 0.04);
    const labelSize = Math.floor(W * 0.034);
    const numberSize = stat.number.length <= 2 ? Math.floor(W * 0.110) : Math.floor(W * 0.078);
    const captionSize = Math.floor(W * 0.032);
    const labelY = statTop + Math.floor(statH * 0.18);
    const numY = statTop + Math.floor(statH * 0.62);
    const capY = statTop + Math.floor(statH * 0.85);

    // The whole tile is one solid-panel via the merge rule (all 3 zones in same style).
    const tileColor = isAccent ? '#1A2330' : theme.headline_color;
    const tileFill = isAccent ? theme.accent : undefined;
    zones.push({
      style: 'solid-panel',
      role: 'label',
      text: stat.label,
      bbox: { x: tileX + innerPad, y: labelY - labelSize, w: statW - innerPad * 2, h: labelSize + 4 },
      color: isAccent ? '#1A2330' : theme.accent,
      fontSize: labelSize,
      isLargeText: true,
      anchor: 'start',
      textX: tileX + innerPad,
      textY: labelY,
      fontWeight: 800,
      letterSpacing: 0.9,
      fillOverride: tileFill,
    });
    zones.push({
      style: 'solid-panel',
      role: 'headline',
      text: stat.number,
      bbox: { x: tileX + innerPad, y: numY - numberSize, w: statW - innerPad * 2, h: numberSize + 4 },
      color: tileColor,
      fontSize: numberSize,
      isLargeText: true,
      anchor: 'start',
      textX: tileX + innerPad,
      textY: numY,
      fontWeight: 900,
      fillOverride: tileFill,
    });
    zones.push({
      style: 'solid-panel',
      role: 'caption',
      text: stat.caption,
      bbox: { x: tileX + innerPad, y: capY - captionSize, w: statW - innerPad * 2, h: captionSize + 4 },
      color: isAccent ? 'rgba(26,35,48,0.82)' : 'rgba(255,255,255,0.86)',
      fontSize: captionSize,
      isLargeText: false,
      anchor: 'start',
      textX: tileX + innerPad,
      textY: capY,
      fontWeight: 400,
      fillOverride: tileFill,
    });
    void tileBbox; // bbox derived from individual zones via merge rule
  });

  // Compose: white phone tile rect + phone → bg → SVG overlay
  const phoneTileSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${sidePad}" y="${phoneAreaTop}" width="${phoneTileW}" height="${phoneAreaH}" rx="18" fill="#FFFFFF" fill-opacity="0.97"/>
  </svg>`;
  const bgWithTile = await sharp(bg)
    .composite([{ input: Buffer.from(phoneTileSvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
  const bgWithPhone = await sharp(bgWithTile)
    .composite([{ input: phoneBuf, top: phoneTop, left: sidePad + phoneTilePadX }])
    .png()
    .toBuffer();
  const overlay = await paintContainersSvg(bgWithPhone, zones, { canvasW: W, canvasH: H });
  const buffer = await sharp(bgWithPhone)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const gateZones: TextZone[] = [];
  const headZones = zones.filter(z => z.role === 'headline' && stats.every(s => s.number !== zones.find(zz => zz.text === zones[0].text)?.text || true));
  // Simpler: just collapse all headline-style entries into one bbox.
  const allHead = zones.filter(z => z.role === 'headline');
  if (allHead.length) {
    gateZones.push({
      role: 'headline',
      text: allHead.map(z => z.text).join(' · '),
      bbox: unionBbox(allHead.map(z => z.bbox)),
      color: allHead[0].color,
      fontSize: allHead[0].fontSize,
      isLargeText: true,
    });
  }
  void headZones;
  return { buffer, zones: gateZones };
}

function parseStat(s: string): { label: string; number: string; caption: string } {
  const parts = s.split('|').map(p => p.trim());
  return {
    label:   parts[0] ?? 'STAT',
    number:  parts[1] ?? '',
    caption: parts[2] ?? '',
  };
}
