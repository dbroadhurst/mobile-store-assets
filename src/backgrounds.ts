import sharp from 'sharp';
import type { Theme, BackgroundStyle } from './types.js';

// Pure SVG → PNG background generators. No browser, no API, no cache needed —
// renders are deterministic from the theme inputs. Each style fills the canvas
// edge-to-edge; the layout's text scrim handles legibility.

export async function renderBackground(
  theme: Theme,
  width: number,
  height: number,
): Promise<Buffer> {
  const svg = svgFor(theme.bg_style, theme, width, height);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function svgFor(style: BackgroundStyle, t: Theme, w: number, h: number): string {
  switch (style) {
    case 'gradient':  return gradientSvg(t, w, h);
    case 'mesh':      return meshSvg(t, w, h);
    case 'bokeh':     return bokehSvg(t, w, h);
    case 'geometric': return geometricSvg(t, w, h);
    case 'minimal':   return minimalSvg(t, w, h);
  }
}

// Diagonal linear gradient from bg_from → bg_to.
function gradientSvg(t: Theme, w: number, h: number): string {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"  stop-color="${t.bg_from}"/>
        <stop offset="100%" stop-color="${t.bg_to}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
  </svg>`;
}

// Multi-blob mesh: stacked radial gradients in the brand palette.
// Approximates CSS mesh-gradient look without needing a browser.
function meshSvg(t: Theme, w: number, h: number): string {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="m1" cx="20%" cy="25%" r="55%">
        <stop offset="0%"  stop-color="${t.primary}"   stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${t.primary}"  stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="m2" cx="80%" cy="20%" r="60%">
        <stop offset="0%"  stop-color="${t.secondary}" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="${t.secondary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="m3" cx="55%" cy="85%" r="65%">
        <stop offset="0%"  stop-color="${t.bg_to}"     stop-opacity="0.90"/>
        <stop offset="100%" stop-color="${t.bg_to}"    stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${t.bg_from}"/>
    <rect width="${w}" height="${h}" fill="url(#m1)"/>
    <rect width="${w}" height="${h}" fill="url(#m2)"/>
    <rect width="${w}" height="${h}" fill="url(#m3)"/>
  </svg>`;
}

// Soft bokeh: blurred radial circles over a base gradient. Expensive but cheap.
function bokehSvg(t: Theme, w: number, h: number): string {
  // Deterministic circle positions (pseudo-random but seeded by canvas size)
  const circles = [
    { cx: w * 0.18, cy: h * 0.22, r: w * 0.18, fill: t.primary,   op: 0.45 },
    { cx: w * 0.74, cy: h * 0.30, r: w * 0.22, fill: t.secondary, op: 0.40 },
    { cx: w * 0.42, cy: h * 0.62, r: w * 0.30, fill: t.primary,   op: 0.30 },
    { cx: w * 0.86, cy: h * 0.78, r: w * 0.16, fill: t.bg_to,     op: 0.55 },
    { cx: w * 0.10, cy: h * 0.88, r: w * 0.14, fill: t.secondary, op: 0.45 },
  ];
  const blurId = 'bokehBlur';
  const blurR = Math.floor(w * 0.06);
  const c = circles
    .map(({ cx, cy, r, fill, op }) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${op}" filter="url(#${blurId})"/>`)
    .join('\n  ');
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bokehBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="${t.bg_from}"/>
        <stop offset="100%" stop-color="${t.bg_to}"/>
      </linearGradient>
      <filter id="${blurId}" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="${blurR}"/>
      </filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bokehBg)"/>
    ${c}
  </svg>`;
}

// Subtle geometric shapes layered over a gradient.
function geometricSvg(t: Theme, w: number, h: number): string {
  // Stripes at a shallow angle plus a few large translucent circles.
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="${t.bg_from}"/>
        <stop offset="100%" stop-color="${t.bg_to}"/>
      </linearGradient>
      <pattern id="diag" patternUnits="userSpaceOnUse" width="${Math.floor(w * 0.1)}" height="${Math.floor(w * 0.1)}" patternTransform="rotate(20)">
        <line x1="0" y1="0" x2="0" y2="${Math.floor(w * 0.1)}" stroke="${t.primary}" stroke-width="2" opacity="0.10"/>
      </pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#gBg)"/>
    <rect width="${w}" height="${h}" fill="url(#diag)"/>
    <circle cx="${w * 0.85}" cy="${h * 0.15}" r="${w * 0.30}" fill="${t.secondary}" opacity="0.12"/>
    <circle cx="${w * 0.15}" cy="${h * 0.80}" r="${w * 0.25}" fill="${t.primary}"   opacity="0.10"/>
  </svg>`;
}

// Flat color with subtle vignette for legibility.
function minimalSvg(t: Theme, w: number, h: number): string {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="vig" cx="50%" cy="50%" r="80%">
        <stop offset="0%"  stop-color="${t.bg_to}"   stop-opacity="0"/>
        <stop offset="100%" stop-color="${t.bg_from}" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${t.primary}"/>
    <rect width="${w}" height="${h}" fill="url(#vig)"/>
  </svg>`;
}
