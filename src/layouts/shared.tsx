import * as React from 'react';
import fs from 'fs';
import path from 'path';

// Shared helpers for every web layout. Avoids re-implementing data-URI
// loading and bracket-keyword highlighting in each layout file.

const IMG_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

export function fileToDataUri(p: string): string {
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = IMG_MIME[ext] ?? 'image/png';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}

export function fileToDataUriOrNull(p: string): string | null {
  return fs.existsSync(p) ? fileToDataUri(p) : null;
}

export function bufferToDataUri(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Convert a screenshot's natural h/w aspect ratio (e.g. 19.5/9 for iPhone,
 * 4/3 for iPad) into a CSS `aspect-ratio` value (w/h, e.g. "1 / 2.166" or
 * "1 / 1.333"). Falls back to iPhone proportions when no measurement is
 * available — preserves prior behaviour for legacy specs.
 *
 * Use this anywhere a layout displays a phone/tablet screenshot — never
 * hardcode `aspectRatio: '9 / 19.5'`, that forces tablet shots into a
 * narrow phone slot and tablet canvases into a phone-shaped mockup.
 */
export function cssAspectRatio(naturalHWRatio: number | undefined): string {
  if (!naturalHWRatio || naturalHWRatio <= 0) return '9 / 19.5';
  // CSS aspect-ratio is width / height. Our input is height / width.
  return `1 / ${naturalHWRatio.toFixed(4)}`;
}

/**
 * Render text with optional `[bracketed]` keyword highlighting in `accent`.
 * Pass `uppercase` to UPPERCASE every fragment (matching the sharp layouts
 * that called `.toUpperCase()` on the whole string).
 */
export function renderWithBrackets(
  raw: string,
  accent: string,
  opts: { uppercase?: boolean } = {},
): React.ReactNode[] {
  const parts = raw.split(/(\[[^\]]+\])/g);
  return parts.map((p, i) => {
    const m = /^\[([^\]]+)\]$/.exec(p);
    if (m) {
      const txt = opts.uppercase ? m[1].toUpperCase() : m[1];
      return <span key={i} style={{ color: accent }}>{txt}</span>;
    }
    return <React.Fragment key={i}>{opts.uppercase ? p.toUpperCase() : p}</React.Fragment>;
  });
}
