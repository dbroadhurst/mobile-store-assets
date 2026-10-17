import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getBrowser } from './browser.js';
import { HtmlShell } from './html-shell.js';
import type { LayoutResult, TextZone, TextRole, ZoneBbox } from '../types.js';

export interface CaptureOptions {
  width: number;
  height: number;
  /**
   * Default `1` — the canvas is already the final pixel size, so we don't
   * want Chromium to double-scale. Override only if a layout needs higher
   * resolution than its viewport (rare).
   */
  deviceScaleFactor?: number;
  /**
   * Retry-driven scrim intensifier in the range [0, ~0.30]. Surfaced to
   * layouts as the CSS custom property `--scrim-boost`. Layouts that paint
   * a backdrop-blur panel reference it in their fill opacity, e.g.
   *
   *   background: rgba(0, 0, 0, calc(0.55 + var(--scrim-boost, 0)));
   *
   * so each retry attempt produces a darker panel without regenerating the
   * layout JSX. Default 0 → no boost.
   */
  scrimBoost?: number;
}

/**
 * Render a JSX layout to a PNG buffer plus the contrast-gate zones harvested
 * from the rendered DOM.
 *
 * This is the new equivalent of the sharp-based `layoutResult` returned by
 * each `src/layouts/*.ts` function. The pipeline:
 *
 *   1. JSX → HTML string  (renderToStaticMarkup)
 *   2. HTML → DOM in headless Chromium  (page.setContent)
 *   3. Wait for fonts to load  (document.fonts.ready)
 *   4. Read real bboxes + computed styles for every `[data-zone]` element
 *      → TextZone[]  (replaces the estimate-bbox math in contrast-gate.ts)
 *   5. Screenshot → PNG buffer
 *
 * The browser instance is reused across calls — callers should invoke
 * `shutdownBrowser()` at the end of the run.
 */
export async function renderAndCapture(
  layout: React.ReactElement,
  opts: CaptureOptions,
): Promise<LayoutResult> {
  const html =
    '<!doctype html>' +
    renderToStaticMarkup(
      React.createElement(HtmlShell, {
        width: opts.width,
        height: opts.height,
        scrimBoost: opts.scrimBoost ?? 0,
        children: layout,
      }),
    );

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => (document as Document).fonts.ready);

    const zones = await harvestZones(page);
    const buffer = await page.screenshot({ type: 'png', fullPage: false, omitBackground: false });

    return { buffer, zones };
  } finally {
    await context.close();
  }
}

// ─── Zone harvesting ────────────────────────────────────────────────────────
// Every text element a layout wants the contrast gate to audit MUST carry a
// `data-zone="<role>"` attribute. We read the real bounding rect plus
// computed color and font-size from the live DOM — no width estimation.

const VALID_ROLES: ReadonlySet<TextRole> = new Set([
  'headline', 'subheadline', 'caption', 'badge', 'label',
]);

interface RawZone {
  role: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  color: string;
  fontSize: number;
  fontWeight: number;
}

async function harvestZones(page: import('playwright').Page): Promise<TextZone[]> {
  const raw: RawZone[] = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-zone]'));
    return els.map(el => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return {
        role: el.dataset.zone || '',
        text: (el.textContent || '').trim(),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        color: cs.color,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseFloat(cs.fontWeight) || 400,
      };
    });
  });

  return raw
    .filter(z => VALID_ROLES.has(z.role as TextRole))
    .map<TextZone>(z => {
      const role = z.role as TextRole;
      const bbox: ZoneBbox = {
        x: Math.round(z.rect.x),
        y: Math.round(z.rect.y),
        w: Math.round(z.rect.width),
        h: Math.round(z.rect.height),
      };
      // WCAG "large text": ≥ 24px regular or ≥ 18.66px bold (≥ 700).
      // Tracked here so the contrast gate uses the AA-large 3.0 ratio instead
      // of 4.5 for big headlines.
      const isLargeText = z.fontWeight >= 700 ? z.fontSize >= 18.66 : z.fontSize >= 24;
      return {
        role,
        text: z.text,
        bbox,
        color: z.color,
        fontSize: z.fontSize,
        isLargeText,
      };
    });
}
