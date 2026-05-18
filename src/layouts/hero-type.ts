import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { resizeBg, stripBrackets, circularCrop, fitWrapped, escapeXml } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { solvePanelAlpha } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// HERO TYPE
// Design proportions lifted directly from
//   design/layouts-phone-portrait-shots.html  (320 × 640 viewBox)
//   design/layouts-tablet-portrait-shots.html (480 × 640 viewBox)
// Numbers are read literally from those SVGs and converted to W/H fractions.
// Tablet detection: aspect H/W < 1.6 picks the tablet table.

interface HeroProps {
  icon:     { cx: number; cy: number; r: number };          // r as fraction of W
  panel:    { x: number; y: number; w: number; h: number;   // fractions
              radius: number };                             // corner radius as fraction of W
  headline: { font: number; lineH: number; y0: number;      // font/y0 as fractions
              cx: number; maxLines: number; minFont: number };
  subhead:  { font: number; y0: number; cx: number;
              maxLines: number; minFont: number };
  chips:    { y: number; h: number; gap: number; font: number;
              charRatio: number; padX: number; cx: number };
}

const PHONE: HeroProps = {
  icon:     { cx: 0.500, cy: 0.203, r: 0.131 },
  panel:    { x: 0.075,  y: 0.344,  w: 0.850, h: 0.469, radius: 0.056 },
  headline: { font: 0.1125, lineH: 1.10, y0: 0.434, cx: 0.500, maxLines: 3, minFont: 0.080 },
  // Floors: subhead ≥ 0.040W (clears 48/1290 with margin).
  subhead:  { font: 0.0500, y0: 0.625, cx: 0.500, maxLines: 2, minFont: 0.040 },
  chips:    { y: 0.747, h: 0.053, gap: 0.019, font: 0.0375, charRatio: 0.62, padX: 0.030, cx: 0.500 },
};

const TABLET: HeroProps = {
  icon:     { cx: 0.500, cy: 0.203, r: 0.108 },
  panel:    { x: 0.083,  y: 0.344,  w: 0.833, h: 0.469, radius: 0.042 },
  headline: { font: 0.0875, lineH: 1.05, y0: 0.447, cx: 0.500, maxLines: 3, minFont: 0.066 },
  subhead:  { font: 0.0480, y0: 0.656, cx: 0.500, maxLines: 2, minFont: 0.040 },
  chips:    { y: 0.728, h: 0.053, gap: 0.021, font: 0.027, charRatio: 0.62, padX: 0.035, cx: 0.500 },
};

export async function heroType(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);

  const isTablet = (H / W) < 1.6;
  const P = isTablet ? TABLET : PHONE;

  const headline = stripBrackets(screenshot.headline).toUpperCase();
  const subheadline = screenshot.subheadline;
  const chips = (screenshot.features ?? []).slice(0, 4).filter(Boolean);

  // ── Icon ────────────────────────────────────────────────────────────────
  const iconR = Math.round(W * P.icon.r);
  const iconCx = Math.round(W * P.icon.cx);
  const iconCy = Math.round(H * P.icon.cy);
  const iconPath = path.join(projectRoot, config.app.icon);
  let bgWithIcon = bg;
  if (fs.existsSync(iconPath)) {
    const iconBuf = await circularCrop(await sharp(iconPath).png().toBuffer(), iconR * 2);
    bgWithIcon = await sharp(bg)
      .composite([{ input: iconBuf, top: iconCy - iconR, left: iconCx - iconR }])
      .png()
      .toBuffer();
  }

  // ── Panel rect (explicit from design proportions) ──────────────────────
  const panelBbox = {
    x: Math.round(W * P.panel.x),
    y: Math.round(H * P.panel.y),
    w: Math.round(W * P.panel.w),
    h: Math.round(H * P.panel.h),
  };

  // ── Headline fit ────────────────────────────────────────────────────────
  const headFont = Math.round(W * P.headline.font);
  const headSafeW = Math.round(panelBbox.w * 0.92);
  const headBudgetH = Math.round(panelBbox.h * 0.52);
  const headWrap = fitWrapped(headline, headSafeW, headBudgetH, headFont, 0.68, P.headline.lineH, {
    maxLines: P.headline.maxLines,
    minSize: Math.round(W * P.headline.minFont),
  });
  const headLineH = Math.round(headWrap.size * P.headline.lineH);

  // ── Subhead fit ─────────────────────────────────────────────────────────
  const subFont = Math.round(W * P.subhead.font);
  const subBudgetH = subheadline ? Math.round(panelBbox.h * 0.18) : 0;
  const subWrap = subheadline
    ? fitWrapped(subheadline, headSafeW, subBudgetH, subFont, 0.55, 1.30, {
        maxLines: P.subhead.maxLines,
        minSize: Math.round(W * P.subhead.minFont),
      })
    : { lines: [] as string[], size: 0 };
  const subLineH = subWrap.size ? Math.round(subWrap.size * 1.30) : 0;

  const cx = Math.round(W * P.headline.cx);
  const headY0 = Math.round(H * P.headline.y0);
  const subY0 = Math.round(H * P.subhead.y0);

  // ── Chips (always dark text on white chip; accent chip → ink text) ─────
  // Cap the row width to canvas safe area (92% of W). If preferred font would
  // make the row overflow the canvas, scale the chip metrics down so the row
  // fits with a small margin each side. Floor: minChipFont so labels never
  // become illegible.
  const chipH = Math.round(H * P.chips.h);
  let chipFont = Math.round(W * P.chips.font);
  let chipPadX = Math.round(W * P.chips.padX);
  let chipGap  = Math.round(W * P.chips.gap);
  const minChipFont = Math.max(Math.round(W * 0.033), 42);
  const maxChipRowW = Math.round(W * 0.92);
  const computeRow = () => {
    const widths = chips.map(c => Math.round(c.length * chipFont * P.chips.charRatio + chipPadX * 2));
    const total = widths.reduce((a, b) => a + b, 0) + chipGap * Math.max(0, chips.length - 1);
    return { widths, total };
  };
  let { widths: chipWidths, total: chipRowW } = computeRow();
  if (chipRowW > maxChipRowW) {
    const scale = maxChipRowW / chipRowW;
    chipFont = Math.max(minChipFont, Math.round(chipFont * scale));
    chipPadX = Math.max(8, Math.round(chipPadX * scale));
    chipGap  = Math.max(6, Math.round(chipGap * scale));
    ({ widths: chipWidths, total: chipRowW } = computeRow());
  }
  const chipY = Math.round(H * P.chips.y);
  let chipCursor = Math.round(W * P.chips.cx - chipRowW / 2);
  const chipSpecs = chips.map((label, i) => {
    const x = chipCursor;
    const w = chipWidths[i];
    chipCursor = x + w + chipGap;
    const isLast = i === chips.length - 1 && chips.length > 1;
    return {
      x, y: chipY, w, h: chipH, label,
      fill: isLast ? theme.accent : '#FFFFFF',
      // CRITICAL: text colour comes from the chip's OWN fill, not the page bg.
      // Light chip → dark ink; accent chip → ink that contrasts the accent.
      textColor: isLast ? '#1A2330' : '#1E2A4A',
    };
  });

  // ── Solve panel alpha against actual sampled bg under the panel ────────
  const panelTexts = [
    { color: theme.headline_color, isLargeText: true },
    ...(subWrap.lines.length ? [{ color: theme.subheadline_color, isLargeText: false }] : []),
  ];
  const { alpha: panelAlpha, scrimDirection } = await solvePanelAlpha(
    bgWithIcon, panelBbox, panelTexts, 'solid-panel',
    Number(process.env.CONTRAST_BOOST ?? 0),
  );
  const panelFill = scrimDirection === 'dark' ? '#0A0F1F' : '#FFFFFF';

  // ── Overlay SVG ─────────────────────────────────────────────────────────
  const panelR = Math.round(W * P.panel.radius);
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${panelBbox.x}" y="${panelBbox.y}" width="${panelBbox.w}" height="${panelBbox.h}"
      rx="${panelR}" ry="${panelR}"
      fill="${panelFill}" fill-opacity="${panelAlpha.toFixed(3)}"/>
    ${headWrap.lines.map((line, i) => {
      const baseline = headY0 + i * headLineH;
      const isAccent = i === headWrap.lines.length - 1 && headWrap.lines.length > 1;
      const fill = isAccent ? theme.accent : theme.headline_color;
      return `<text x="${cx}" y="${baseline}" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="${headWrap.size}" font-weight="900"
        letter-spacing="-1" fill="${fill}">${escapeXml(line)}</text>`;
    }).join('\n')}
    ${subWrap.lines.map((line, i) => {
      const baseline = subY0 + i * subLineH;
      return `<text x="${cx}" y="${baseline}" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="${subWrap.size}" font-weight="500"
        fill="${theme.subheadline_color}">${escapeXml(line)}</text>`;
    }).join('\n')}
    ${chipSpecs.map(s => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
      rx="${Math.round(s.h / 2)}" fill="${s.fill}" fill-opacity="0.92"/>
      <text x="${s.x + Math.round(s.w / 2)}" y="${s.y + Math.round(s.h * 0.66)}" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="${chipFont}" font-weight="700"
        fill="${s.textColor}">${escapeXml(s.label)}</text>`).join('\n')}
  </svg>`;

  const buffer = await sharp(bgWithIcon)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // ── Gate zones ──────────────────────────────────────────────────────────
  const headBboxes = headWrap.lines.map((line, i) =>
    estimateTextBbox({ x: cx, y: headY0 + i * headLineH, text: line,
      fontSize: headWrap.size, anchor: 'middle', charRatio: 0.68 }),
  );
  const subBboxes = subWrap.lines.map((line, i) =>
    estimateTextBbox({ x: cx, y: subY0 + i * subLineH, text: line,
      fontSize: subWrap.size, anchor: 'middle', charRatio: 0.55 }),
  );
  const zones: TextZone[] = [];
  if (headBboxes.length) {
    zones.push({
      role: 'headline', text: headWrap.lines.join(' '),
      bbox: unionBbox(headBboxes),
      color: theme.headline_color, fontSize: headWrap.size, isLargeText: true,
    });
  }
  if (subBboxes.length) {
    zones.push({
      role: 'subheadline', text: subWrap.lines.join(' '),
      bbox: unionBbox(subBboxes),
      color: theme.subheadline_color, fontSize: subWrap.size,
      isLargeText: subWrap.size >= W * 0.022,
    });
  }
  return { buffer, zones };
}
