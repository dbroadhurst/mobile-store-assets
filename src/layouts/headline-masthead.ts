import sharp from 'sharp';
import { resizeBg, stripBrackets, makeDeviceFrame, screenshotAspect, fitWrapped, escapeXml } from '../helpers.js';
import { estimateTextBbox, unionBbox } from '../contrast-gate.js';
import { solvePanelAlpha, fitPhone } from '../containers.js';
import type { LayoutInput, LayoutResult, TextZone } from '../types.js';

// HEADLINE MASTHEAD
// Solid headline panel up top (with optional eyebrow chip), phone fills the
// bottom. Proportions from design/layouts-phone-portrait-shots.html (#3) and
// design/layouts-tablet-portrait-shots.html (TP-06).

interface MastheadProps {
  panel:    { x: number; y: number; w: number; h: number; radius: number };
  eyebrow:  { x: number; y: number; w: number; h: number; font: number };  // optional chip
  headline: { x: number; y0: number; font: number; lineH: number;
              maxLines: number; minFont: number };
  phone:    { topY: number; sidePad: number; bottomPad: number };           // y/sidePad as fractions of H/W
}

const PHONE: MastheadProps = {
  panel:    { x: 0.0625, y: 0.0563, w: 0.875, h: 0.259, radius: 0.056 },
  eyebrow:  { x: 0.125,  y: 0.0875, w: 0.181, h: 0.0344, font: 0.0344 },
  headline: { x: 0.125,  y0: 0.184, font: 0.0938, lineH: 1.05, maxLines: 3, minFont: 0.060 },
  phone:    { topY: 0.350, sidePad: 0.10, bottomPad: 0.04 },
};

const TABLET: MastheadProps = {
  panel:    { x: 0.05,   y: 0.056,  w: 0.90,  h: 0.313, radius: 0.042 },
  eyebrow:  { x: 0.092,  y: 0.094,  w: 0.129, h: 0.040, font: 0.027 },
  headline: { x: 0.092,  y0: 0.206, font: 0.071, lineH: 1.08, maxLines: 3, minFont: 0.048 },
  phone:    { topY: 0.42, sidePad: 0.18, bottomPad: 0.04 },
};

export async function headlineMasthead(input: LayoutInput): Promise<LayoutResult> {
  const { background, screenshotPath, screenshot, theme, targetWidth: W, targetHeight: H } = input;
  const bg = await resizeBg(background, W, H);
  if (!screenshotPath) throw new Error('headline-masthead requires a screenshot source');

  const isTablet = (H / W) < 1.6;
  const P = isTablet ? TABLET : PHONE;

  const headline = stripBrackets(screenshot.headline);
  const eyebrow = screenshot.badge_label ?? '';

  // ── Panel rect (explicit, design-proportional) ────────────────────────
  const panelBbox = {
    x: Math.round(W * P.panel.x),
    y: Math.round(H * P.panel.y),
    w: Math.round(W * P.panel.w),
    h: Math.round(H * P.panel.h),
  };

  // ── Eyebrow chip (optional) ────────────────────────────────────────────
  let eyebrowSpec: { x: number; y: number; w: number; h: number; font: number; text: string } | null = null;
  if (eyebrow) {
    const ebFont = Math.round(W * P.eyebrow.font);
    const ebText = eyebrow.toUpperCase();
    const ebW = Math.round(ebText.length * ebFont * 0.62 + ebFont * 1.4);
    eyebrowSpec = {
      x: Math.round(W * P.eyebrow.x),
      y: Math.round(H * P.eyebrow.y),
      w: ebW,
      h: Math.round(H * P.eyebrow.h),
      font: ebFont,
      text: ebText,
    };
  }

  // ── Headline fit (left-aligned, VERTICALLY CENTRED inside the panel) ───
  // Vertical centring matters because the panel size is fixed by design but
  // headline length varies per app. Short headline at the top of the panel
  // reads as broken whitespace; vertical centring balances it instead.
  const headTextLeft = Math.round(W * P.headline.x);
  const headFont = Math.round(W * P.headline.font);
  const headSafeW = (panelBbox.x + panelBbox.w) - headTextLeft - Math.round(W * 0.03);
  // Reserve panel space for eyebrow chip + headline.
  const eyebrowReserve = eyebrowSpec
    ? (eyebrowSpec.y + eyebrowSpec.h) - panelBbox.y + Math.round(H * 0.015)
    : Math.round(panelBbox.h * 0.08);
  const headPanelTop = panelBbox.y + eyebrowReserve;
  const headPanelH = panelBbox.h - eyebrowReserve - Math.round(panelBbox.h * 0.06);
  const headWrap = fitWrapped(headline, headSafeW, headPanelH, headFont, 0.60, P.headline.lineH, {
    maxLines: P.headline.maxLines,
    minSize: Math.round(W * P.headline.minFont),
  });
  const headLineH = Math.round(headWrap.size * P.headline.lineH);
  const headBlockH = headWrap.lines.length * headLineH;
  // Centre the text block within the available headline area.
  const headY0 = headPanelTop + Math.round((headPanelH - headBlockH) / 2) + Math.round(headWrap.size * 0.85);

  // ── Phone (capped to available area; no overflow) ──────────────────────
  const ssAspect = await screenshotAspect(screenshotPath);
  const phoneAreaTop = Math.round(H * P.phone.topY);
  const phoneAreaH = H - phoneAreaTop - Math.round(H * P.phone.bottomPad);
  const phoneMaxW = W - Math.round(W * P.phone.sidePad) * 2;
  const { w: phoneW, h: phoneH } = fitPhone(phoneMaxW, phoneAreaH, ssAspect);
  const phoneLeft = Math.round((W - phoneW) / 2);
  const phoneTop = phoneAreaTop + Math.floor((phoneAreaH - phoneH) / 2);
  const phoneBuf = await makeDeviceFrame(screenshotPath, phoneW, phoneH, 0, 0, 'top', 'cover');
  const bgWithPhone = await sharp(bg)
    .composite([{ input: phoneBuf, top: phoneTop, left: phoneLeft }])
    .png()
    .toBuffer();

  // ── Solve panel alpha ──────────────────────────────────────────────────
  const panelTexts = [{ color: theme.headline_color, isLargeText: true }];
  const { alpha: panelAlpha, scrimDirection } = await solvePanelAlpha(
    bgWithPhone, panelBbox, panelTexts, 'solid-panel',
    Number(process.env.CONTRAST_BOOST ?? 0),
  );
  const panelFill = scrimDirection === 'dark' ? '#0A0F1F' : '#FFFFFF';

  // ── Build overlay ──────────────────────────────────────────────────────
  const panelR = Math.round(W * P.panel.radius);
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${panelBbox.x}" y="${panelBbox.y}" width="${panelBbox.w}" height="${panelBbox.h}"
      rx="${panelR}" ry="${panelR}"
      fill="${panelFill}" fill-opacity="${panelAlpha.toFixed(3)}"/>
    ${eyebrowSpec ? `<rect x="${eyebrowSpec.x}" y="${eyebrowSpec.y}" width="${eyebrowSpec.w}" height="${eyebrowSpec.h}"
      rx="${Math.round(eyebrowSpec.h / 2)}" fill="${theme.accent}" fill-opacity="0.95"/>
      <text x="${eyebrowSpec.x + Math.round(eyebrowSpec.w / 2)}" y="${eyebrowSpec.y + Math.round(eyebrowSpec.h * 0.68)}"
        text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${eyebrowSpec.font}"
        font-weight="800" letter-spacing="0.5" fill="#1A2330">${escapeXml(eyebrowSpec.text)}</text>` : ''}
    ${headWrap.lines.map((line, i) => {
      const baseline = headY0 + i * headLineH;
      const isAccent = i === headWrap.lines.length - 1 && headWrap.lines.length > 1;
      const fill = isAccent ? theme.accent : theme.headline_color;
      return `<text x="${headTextLeft}" y="${baseline}"
        font-family="Arial,Helvetica,sans-serif" font-size="${headWrap.size}" font-weight="900"
        letter-spacing="-0.8" fill="${fill}">${escapeXml(line)}</text>`;
    }).join('\n')}
  </svg>`;

  const buffer = await sharp(bgWithPhone)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();

  // ── Gate zones ─────────────────────────────────────────────────────────
  const headBboxes = headWrap.lines.map((line, i) =>
    estimateTextBbox({ x: headTextLeft, y: headY0 + i * headLineH, text: line,
      fontSize: headWrap.size, anchor: 'start', charRatio: 0.60 }),
  );
  const zones: TextZone[] = [];
  if (headBboxes.length) {
    zones.push({
      role: 'headline', text: headWrap.lines.join(' '),
      bbox: unionBbox(headBboxes),
      color: theme.headline_color, fontSize: headWrap.size, isLargeText: true,
    });
  }
  return { buffer, zones };
}
