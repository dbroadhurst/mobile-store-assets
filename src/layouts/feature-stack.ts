import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { resizeBg, stripBrackets, circularCrop, fitWrapped, escapeXml } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { solvePanelAlpha } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// FEATURE STACK
// No phone. Icon + 2-line headline + 4 numbered row panels + footer chip.
// Each row is an EXPLICIT panel rect (not text-hugging) so the column
// rhythm matches the design.
// Proportions from design/layouts-phone-portrait-shots.html (#6) and
// design/layouts-tablet-portrait-shots.html (TP-05).

interface StackProps {
  icon:     { cx: number; cy: number; r: number };
  title:    { x: number; y: number; w: number; h: number;
              font: number; lineH: number; maxLines: number; minFont: number };
  rows:     { top: number; gap: number; h: number; sidePad: number;     // top/h/gap/sidePad fractions of H/W
              badgeR: number; badgeCx: number; textX: number;            // r/cx/textX fractions of W
              labelFont: number; bodyFont: number; minLabel: number };
  footer:   { y: number; w: number; h: number; cx: number; font: number };
}

const PHONE: StackProps = {
  icon:     { cx: 0.500, cy: 0.116, r: 0.106 },
  title:    { x: 0.0625, y: 0.194, w: 0.875, h: 0.125,
              font: 0.0700, lineH: 1.13, maxLines: 2, minFont: 0.066 },
  rows:     { top: 0.350, gap: 0.019, h: 0.119, sidePad: 0.0625,
              badgeR: 0.069, badgeCx: 0.175, textX: 0.288,
              labelFont: 0.050, bodyFont: 0.0375, minLabel: 0.038 },
  footer:   { y: 0.909, w: 0.875, h: 0.059, cx: 0.5, font: 0.0344 },
};

const TABLET: StackProps = {
  icon:     { cx: 0.500, cy: 0.119, r: 0.083 },
  title:    { x: 0.0833, y: 0.213, w: 0.833, h: 0.138,
              font: 0.070, lineH: 1.13, maxLines: 2, minFont: 0.066 },
  rows:     { top: 0.384, gap: 0.014, h: 0.122, sidePad: 0.0833,
              badgeR: 0.050, badgeCx: 0.158, textX: 0.242,
              labelFont: 0.0375, bodyFont: 0.030, minLabel: 0.030 },
  footer:   { y: 0.953, w: 0.833, h: 0.038, cx: 0.5, font: 0.027 },
};

export async function featureStack(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshot, theme, config, targetWidth: W, targetHeight: H, projectRoot } = input;
  const bg = await resizeBg(background, W, H);

  const isTablet = (H / W) < 1.6;
  const P = isTablet ? TABLET : PHONE;

  const headline = stripBrackets(screenshot.headline);
  const features = (screenshot.features ?? []).slice(0, 4).filter(Boolean);
  const footerText = screenshot.badge_label
    ? `${screenshot.badge_count ?? ''} ${screenshot.badge_label}`.trim()
    : '';

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

  // ── Title panel ─────────────────────────────────────────────────────────
  const titleBbox = {
    x: Math.round(W * P.title.x),
    y: Math.round(H * P.title.y),
    w: Math.round(W * P.title.w),
    h: Math.round(H * P.title.h),
  };
  const titleFont = Math.round(W * P.title.font);
  const titleSafeW = Math.round(titleBbox.w * 0.92);
  const titleBudgetH = Math.round(titleBbox.h * 0.75);
  const titleWrap = fitWrapped(headline, titleSafeW, titleBudgetH, titleFont, 0.60, P.title.lineH, {
    maxLines: P.title.maxLines,
    minSize: Math.round(W * P.title.minFont),
  });
  const titleLineH = Math.round(titleWrap.size * P.title.lineH);
  const titleCx = titleBbox.x + Math.round(titleBbox.w / 2);
  // First baseline: vertically centred within the title panel.
  const titleBlockH = titleWrap.lines.length * titleLineH;
  const titleY0 = titleBbox.y + Math.round((titleBbox.h - titleBlockH) / 2) + titleLineH;

  // ── Row panels (explicit rects) ─────────────────────────────────────────
  const rowsTop = Math.round(H * P.rows.top);
  const rowH = Math.round(H * P.rows.h);
  const rowGap = Math.round(H * P.rows.gap);
  const sidePad = Math.round(W * P.rows.sidePad);
  const rowW = W - sidePad * 2;
  const badgeR = Math.round(W * P.rows.badgeR);
  const badgeCx = Math.round(W * P.rows.badgeCx);
  const textX = Math.round(W * P.rows.textX);
  const labelFont = Math.round(W * P.rows.labelFont);
  const bodyFont = Math.round(W * P.rows.bodyFont);
  const rowR = Math.round(W * 0.044);

  interface Row {
    bbox: { x: number; y: number; w: number; h: number };
    label: string;
    body: string;
    isAccent: boolean;
    badgeCy: number;
    badgeText: string;     // "1", "2", "3", or "★"
  }
  const rows: Row[] = features.map((raw, i) => {
    const [labelRaw, ...bodyParts] = raw.split(/\s*[—–-]\s*/);
    const isAccent = i === features.length - 1 && features.length > 1;
    const y = rowsTop + i * (rowH + rowGap);
    return {
      bbox: { x: sidePad, y, w: rowW, h: rowH },
      label: labelRaw.trim(),
      body: bodyParts.join(' — ').trim(),
      isAccent,
      badgeCy: y + Math.round(rowH / 2),
      badgeText: isAccent ? '★' : String(i + 1),
    };
  });

  // ── Footer chip (optional) ─────────────────────────────────────────────
  let footerSpec: { x: number; y: number; w: number; h: number; font: number; text: string } | null = null;
  if (footerText) {
    const fW = Math.round(W * P.footer.w);
    const fH = Math.round(H * P.footer.h);
    footerSpec = {
      x: Math.round(W * P.footer.cx - fW / 2),
      y: Math.round(H * P.footer.y),
      w: fW,
      h: fH,
      font: Math.round(W * P.footer.font),
      text: footerText,
    };
  }

  // ── Solve title alpha (title sits on bg only — icon is above the panel) ─
  const titleAlphaR = await solvePanelAlpha(
    bgWithIcon, titleBbox, [{ color: theme.headline_color, isLargeText: true }],
    'solid-panel', Number(process.env.CONTRAST_BOOST ?? 0),
  );
  const titleFill = titleAlphaR.scrimDirection === 'dark' ? '#0A0F1F' : '#FFFFFF';

  // Non-accent rows share ONE alpha + fill so the column reads as a single
  // visual unit. Pick the worst-case alpha across the rows (max), and the
  // majority scrim direction. Accent row keeps its opaque branded fill.
  const boost = Number(process.env.CONTRAST_BOOST ?? 0);
  const nonAccentRows = rows.filter(r => !r.isAccent);
  const nonAccentSolved = await Promise.all(nonAccentRows.map(async (r) => {
    const textColors = [
      { color: theme.headline_color, isLargeText: true },
      ...(r.body ? [{ color: 'rgba(255,255,255,0.84)', isLargeText: false }] : []),
    ];
    return solvePanelAlpha(bgWithIcon, r.bbox, textColors, 'solid-panel', boost);
  }));
  const sharedAlpha = nonAccentSolved.length
    ? Math.max(...nonAccentSolved.map(s => s.alpha))
    : 0.74;
  // Majority direction wins; default dark.
  const darkCount = nonAccentSolved.filter(s => s.scrimDirection === 'dark').length;
  const sharedDirection: 'dark' | 'light' = darkCount >= nonAccentSolved.length / 2 ? 'dark' : 'light';
  const sharedFill = sharedDirection === 'dark' ? '#0A0F1F' : '#FFFFFF';
  const sharedBody = sharedDirection === 'dark' ? 'rgba(255,255,255,0.84)' : 'rgba(26,35,48,0.78)';
  const sharedText = sharedDirection === 'dark' ? theme.headline_color : '#1A2330';

  const rowAlphas = rows.map(r => {
    if (r.isAccent) return {
      alpha: 0.96, fill: theme.accent,
      textColor: '#1A2330', bodyColor: 'rgba(26,35,48,0.82)',
    };
    return {
      alpha: sharedAlpha, fill: sharedFill,
      textColor: sharedText, bodyColor: sharedBody,
    };
  });

  // ── Overlay ────────────────────────────────────────────────────────────
  const panelR = Math.round(W * 0.044);
  const titlePanelR = Math.round(W * 0.044);
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${titleBbox.x}" y="${titleBbox.y}" width="${titleBbox.w}" height="${titleBbox.h}"
      rx="${titlePanelR}" ry="${titlePanelR}"
      fill="${titleFill}" fill-opacity="${titleAlphaR.alpha.toFixed(3)}"/>
    ${titleWrap.lines.map((line, i) => {
      const baseline = titleY0 + i * titleLineH;
      const isAccent = i === titleWrap.lines.length - 1 && titleWrap.lines.length > 1;
      const fill = isAccent ? theme.accent : theme.headline_color;
      return `<text x="${titleCx}" y="${baseline}" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="${titleWrap.size}" font-weight="900"
        letter-spacing="-0.4" fill="${fill}">${escapeXml(line)}</text>`;
    }).join('\n')}
    ${rows.map((r, i) => {
      const a = rowAlphas[i];
      const labelY = r.bbox.y + Math.round(rowH * 0.50);
      const bodyY  = r.bbox.y + Math.round(rowH * 0.78);
      return `<rect x="${r.bbox.x}" y="${r.bbox.y}" width="${r.bbox.w}" height="${r.bbox.h}"
          rx="${rowR}" ry="${rowR}"
          fill="${a.fill}" fill-opacity="${a.alpha.toFixed(3)}"/>
        <circle cx="${badgeCx}" cy="${r.badgeCy}" r="${badgeR}"
          fill="${r.isAccent ? '#1A2330' : theme.accent}"/>
        <text x="${badgeCx}" y="${r.badgeCy + Math.round(badgeR * 0.35)}" text-anchor="middle"
          font-family="Arial,Helvetica,sans-serif" font-size="${Math.round(badgeR * 1.0)}" font-weight="900"
          fill="${r.isAccent ? theme.accent : '#1A2330'}">${escapeXml(r.badgeText)}</text>
        <text x="${textX}" y="${labelY}"
          font-family="Arial,Helvetica,sans-serif" font-size="${labelFont}" font-weight="800"
          letter-spacing="-0.2" fill="${a.textColor}">${escapeXml(r.label)}</text>
        ${r.body ? `<text x="${textX}" y="${bodyY}"
          font-family="Arial,Helvetica,sans-serif" font-size="${bodyFont}"
          fill="${a.bodyColor}">${escapeXml(r.body)}</text>` : ''}`;
    }).join('\n')}
    ${footerSpec ? `<rect x="${footerSpec.x}" y="${footerSpec.y}" width="${footerSpec.w}" height="${footerSpec.h}"
      rx="${Math.round(footerSpec.h / 2)}" fill="#FFFFFF" fill-opacity="0.94"/>
      <text x="${footerSpec.x + Math.round(footerSpec.w / 2)}" y="${footerSpec.y + Math.round(footerSpec.h * 0.66)}"
        text-anchor="middle" font-family="Arial,Helvetica,sans-serif"
        font-size="${footerSpec.font}" font-weight="700"
        fill="#1E2A4A">${escapeXml(footerSpec.text)}</text>` : ''}
  </svg>`;

  const buffer = await sharp(bgWithIcon)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // ── Gate zones ─────────────────────────────────────────────────────────
  const titleBboxes = titleWrap.lines.map((line, i) =>
    estimateTextBbox({ x: titleCx, y: titleY0 + i * titleLineH, text: line,
      fontSize: titleWrap.size, anchor: 'middle', charRatio: 0.60 }),
  );
  const labelBboxes = rows.map(r =>
    estimateTextBbox({
      x: textX, y: r.bbox.y + Math.round(rowH * 0.50), text: r.label,
      fontSize: labelFont, anchor: 'start', charRatio: 0.58,
    })
  );
  const zones: TextZone[] = [];
  if (titleBboxes.length) {
    zones.push({
      role: 'headline', text: titleWrap.lines.join(' '),
      bbox: unionBbox(titleBboxes),
      color: theme.headline_color, fontSize: titleWrap.size, isLargeText: true,
    });
  }
  if (labelBboxes.length) {
    zones.push({
      role: 'label', text: rows.map(r => r.label).join(' · '),
      bbox: unionBbox(labelBboxes),
      color: theme.headline_color, fontSize: labelFont, isLargeText: true,
    });
  }
  void panelR;
  return { buffer, zones };
}
