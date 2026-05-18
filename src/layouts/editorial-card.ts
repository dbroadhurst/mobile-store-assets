import sharp from 'sharp';
import { resizeBg, stripBrackets, makeDeviceFrame, screenshotAspect, rotateBuffer, fitWrapped } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { paintContainersSvg, type ContainerZone } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// v2 #4 — EDITORIAL CARD
// Phone is the dominant hero (full width, slight tilt, clipping the top edge).
// Solid panel anchors to the bottom-left with a vertical accent rule and
// overlaps the phone. Magazine feel.
export async function editorialCard(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('editorial-card requires a screenshot source');

  const headline = stripBrackets(screenshot.headline);
  const stepLabel = screenshot.badge_label && screenshot.badge_count
    ? `${screenshot.badge_label.toUpperCase()} ${screenshot.badge_count}`
    : screenshot.badge_label?.toUpperCase() ?? '';
  const body = screenshot.subheadline;

  // Phone: full width, slight tilt, clips top.
  const ssAspect = await screenshotAspect(screenshotPath);
  const phoneW = Math.floor(W * 0.78);
  const phoneH = Math.round(phoneW * ssAspect);
  const phoneRaw = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const phoneTilted = await rotateBuffer(phoneRaw, -3);
  const phoneMeta = await sharp(phoneTilted).metadata();
  const phoneFinalW = phoneMeta.width ?? phoneW;
  const phoneFinalH = phoneMeta.height ?? phoneH;
  // Position phone slightly above canvas top so it clips.
  const phoneTop = Math.floor(H * 0.06) - Math.floor(phoneFinalH * 0.05);
  const phoneLeft = Math.floor((W - phoneFinalW) / 2);

  // Bottom-left panel overlapping phone.
  const sidePad = Math.floor(W * 0.04);
  const panelW = Math.floor(W * 0.74);
  const panelX = 0;            // flush left
  const panelH = Math.floor(H * 0.30);
  const panelY = H - panelH - Math.floor(H * 0.03);
  const accentRuleW = 6;
  const textLeft = sidePad + Math.floor(W * 0.01);

  const zones: ContainerZone[] = [];

  // Step chip (top of panel).
  let textY0 = panelY + Math.floor(H * 0.025);
  if (stepLabel) {
    const chipSize = Math.floor(W * 0.034);
    const chipH = Math.floor(chipSize * 2.2);
    const chipW = Math.ceil(stepLabel.length * chipSize * 0.62 + chipSize * 1.4);
    zones.push({
      style: 'chip',
      role: 'badge',
      text: stepLabel,
      bbox: { x: textLeft, y: textY0, w: chipW, h: chipH },
      color: '#1A2330',
      fontSize: chipSize,
      isLargeText: false,
      anchor: 'middle',
      textX: textLeft + chipW / 2,
      textY: textY0 + Math.floor(chipH * 0.66),
      fillOverride: theme.accent,
      fontWeight: 800,
      letterSpacing: 0.5,
    });
    textY0 += chipH + Math.floor(H * 0.015);
  }

  // Headline — 2-3 lines, accent on last.
  const safe = panelW - sidePad * 2 - accentRuleW;
  const headBudgetH = panelY + panelH - textY0 - (body ? Math.floor(H * 0.06) : Math.floor(H * 0.02));
  const headWrap = fitWrapped(headline, safe, headBudgetH,
    Math.floor(W * 0.078), 0.6, 1.10, { maxLines: 3, minSize: Math.floor(W * 0.046) });
  const headLineH = Math.floor(headWrap.size * 1.10);

  headWrap.lines.forEach((line, i) => {
    const baseline = textY0 + (i + 1) * headLineH;
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
      letterSpacing: -0.6,
    });
  });

  // Body lines (optional).
  if (body) {
    const bodyY0 = textY0 + headWrap.lines.length * headLineH + Math.floor(H * 0.02);
    const bodyBudgetH = panelY + panelH - bodyY0 - Math.floor(H * 0.015);
    const bodyWrap = fitWrapped(body, safe, bodyBudgetH,
      Math.floor(W * 0.038), 0.55, 1.25, { maxLines: 2, minSize: Math.floor(W * 0.038) });
    const bodyLineH = Math.floor(bodyWrap.size * 1.25);
    bodyWrap.lines.forEach((line, i) => {
      const baseline = bodyY0 + (i + 1) * bodyLineH;
      const bbox = estimateTextBbox({ x: textLeft, y: baseline, text: line, fontSize: bodyWrap.size, anchor: 'start', charRatio: 0.55 });
      zones.push({
        style: 'solid-panel',
        role: 'caption',
        text: line,
        bbox,
        color: theme.subheadline_color,
        fontSize: bodyWrap.size,
        isLargeText: false,
        anchor: 'start',
        textX: textLeft,
        textY: baseline,
        fontWeight: 400,
      });
    });
  }

  // Composite: bg → tilted phone → SVG overlay (panel + text + accent rule)
  const phoneCompose = await clipToCanvas(phoneTilted, phoneFinalW, phoneFinalH, phoneTop, phoneLeft, W, H);
  const bgWithPhone = phoneCompose
    ? await sharp(bg).composite([phoneCompose]).png().toBuffer()
    : bg;

  // Manually emit the accent rule (a chip-like vertical bar to the right of the panel)
  const accentRuleSvg = `<rect x="${panelW}" y="${panelY}" width="${accentRuleW}" height="${panelH}" fill="${theme.accent}"/>`;
  const overlay = await paintContainersSvg(bgWithPhone, zones, {
    canvasW: W, canvasH: H,
    extraDefs: accentRuleSvg,
  });
  const buffer = await sharp(bgWithPhone)
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

// Local helper — same as the one in index.ts but inlined to avoid import cycles.
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
