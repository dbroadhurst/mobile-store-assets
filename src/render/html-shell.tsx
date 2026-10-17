import * as React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve templates/tailwind.css relative to this file. The CSS bundle is
// built by `npm run build:css` (or `build:css --watch` during dev) from
// templates/tailwind-input.css. Inlining keeps every render self-contained
// — no network, no FS lookups inside the browser context.
const TAILWIND_CSS_PATH = path.resolve(__dirname, '../../templates/tailwind.css');

let _cachedTailwindCss: string | null = null;

function loadTailwindCss(): string {
  if (_cachedTailwindCss !== null) return _cachedTailwindCss;
  try {
    _cachedTailwindCss = fs.readFileSync(TAILWIND_CSS_PATH, 'utf8');
  } catch {
    throw new Error(
      `Tailwind CSS bundle not found at ${TAILWIND_CSS_PATH}. ` +
      `Run \`npm run build:css\` to generate it.`,
    );
  }
  return _cachedTailwindCss;
}

export interface ShellProps {
  width: number;
  height: number;
  /**
   * Retry-driven scrim intensifier exposed to layouts as `--scrim-boost`
   * on `<html>`. Default 0. See CaptureOptions.scrimBoost.
   */
  scrimBoost?: number;
  /** The layout to render inside the canvas. */
  children: React.ReactNode;
}

/**
 * Full HTML document framing a single layout at exact pixel dimensions.
 *
 * Key choices:
 *  - `<html style="width: Wpx; height: Hpx">` matches Playwright viewport,
 *    so 1cqw = 1% of canvas width (since the canvas-root fills <body>).
 *  - Inter Variable loaded from Google Fonts. In Phase 4 this gets bundled
 *    as base64 woff2 for offline reproducibility — for Phase 1, capture.ts
 *    awaits `document.fonts.ready` before screenshotting.
 *  - Tailwind CSS is inlined from the precompiled bundle so renders never
 *    depend on a build step at runtime.
 */
export function HtmlShell({ width, height, scrimBoost = 0, children }: ShellProps) {
  const css = loadTailwindCss();
  // `--scrim-boost` is consumed by layouts in their panel `background:
  // rgba(... calc(BASE + var(--scrim-boost, 0)))`. React's CSS-property typing
  // doesn't allow arbitrary custom properties in a `style` object without a
  // small cast.
  const rootStyle: React.CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
    ['--scrim-boost' as never]: scrimBoost.toFixed(3),
  };
  return (
    <html lang="en" style={rootStyle}>
      <head>
        <meta charSet="utf-8" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
          body { font-family: Inter, -apple-system, "SF Pro Display", system-ui, sans-serif; }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
