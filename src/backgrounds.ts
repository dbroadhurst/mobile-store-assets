import sharp from 'sharp';
import type { Theme, BackgroundStyle } from './types.js';

// Pure SVG → PNG background generators. No browser, no API, no cache needed —
// renders are deterministic from the theme inputs. Each style fills the canvas
// edge-to-edge; the layout's text scrim handles legibility.

export async function renderBackground(
  theme: Theme,
  width: number,
  height: number,
  motifTokens: string[] = [],
): Promise<Buffer> {
  const svg = svgFor(theme.bg_style, theme, width, height, motifTokens);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function svgFor(style: BackgroundStyle, t: Theme, w: number, h: number, tokens: string[]): string {
  switch (style) {
    case 'gradient':   return gradientSvg(t, w, h);
    case 'mesh':       return meshSvg(t, w, h);
    case 'bokeh':      return bokehSvg(t, w, h);
    case 'geometric':  return geometricSvg(t, w, h);
    case 'minimal':    return minimalSvg(t, w, h);
    case 'app-motif':  return appMotifSvg(t, w, h, tokens);
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

// App-motif: gradient base plus a scatter of faint vector glyphs keyed to the
// app's domain (finance, fitness, music, …). Glyphs render at very low opacity
// in the theme's headline colour so they read as a watermark behind the text
// without competing for attention. Tokens come from buildAppContext() in
// index.ts; unmatched apps fall back to abstract shapes.
//
// Each glyph entry is path data on a 100×100 viewBox using `evenodd` fill so
// concentric strokes/holes render cleanly.
const MOTIF_GLYPHS: Record<string, string[]> = {
  finance: [
    // House silhouette with door cutout
    'M50,15 L88,42 L88,88 L62,88 L62,62 L38,62 L38,88 L12,88 L12,42 Z',
    // Stylised key
    'M28,50 m-16,0 a16,16 0 1,0 32,0 a16,16 0 1,0 -32,0 M44,50 L90,50 L90,60 L82,60 L82,55 L74,55 L74,60 L66,60',
    // Bar chart growth
    'M10,84 L10,68 L24,68 L24,84 Z M30,84 L30,52 L44,52 L44,84 Z M50,84 L50,36 L64,36 L64,84 Z M70,84 L70,20 L84,20 L84,84 Z',
  ],
  money: [
    // Coin stack
    'M14,30 a36,8 0 1,0 72,0 a36,8 0 1,0 -72,0 M14,30 L14,44 a36,8 0 1,0 72,0 L86,30 M14,54 a36,8 0 1,0 72,0 M14,54 L14,68 a36,8 0 1,0 72,0 L86,54',
    // Upward line graph
    'M8,82 L26,58 L46,68 L66,32 L92,42 L92,46 L66,36 L46,72 L26,62 L8,86 Z',
    // Pie slice
    'M50,50 L50,12 A38,38 0 0,1 84,68 Z',
  ],
  fitness: [
    // Heart
    'M50,84 C18,58 4,32 28,20 C40,14 50,24 50,30 C50,24 60,14 72,20 C96,32 82,58 50,84 Z',
    // Dumbbell
    'M8,40 L8,60 L18,60 L18,40 Z M18,46 L82,46 L82,54 L18,54 Z M82,40 L82,60 L92,60 L92,40 Z',
    // ECG pulse
    'M4,50 L26,50 L34,30 L46,72 L56,40 L66,52 L96,52 L96,48 L66,48 L56,36 L46,64 L34,26 L26,46 L4,46 Z',
  ],
  meditation: [
    // Concentric circles (lotus-feel)
    'M50,16 a34,34 0 1,0 0,68 a34,34 0 1,0 0,-68 M50,28 a22,22 0 1,0 0,44 a22,22 0 1,0 0,-44 M50,40 a10,10 0 1,0 0,20 a10,10 0 1,0 0,-20',
    // Stacked calm waves
    'M4,38 Q22,22 40,38 T76,38 T112,38 L112,44 Q76,44 76,44 T40,44 Q22,28 4,44 Z M4,58 Q22,42 40,58 T76,58 T112,58 L112,64 Q76,64 76,64 T40,64 Q22,48 4,64 Z',
    // Crescent moon
    'M62,12 a38,38 0 1,0 0,76 a28,28 0 1,1 0,-76 Z',
  ],
  learning: [
    // Open book
    'M8,24 L48,12 L48,80 L8,88 Z M52,12 L92,24 L92,88 L52,80 Z',
    // Graduation cap
    'M50,14 L92,30 L50,46 L8,30 Z M30,40 L30,62 Q50,76 70,62 L70,40 L66,40 L66,60 Q50,70 34,60 L34,40 Z',
    // Pencil
    'M16,18 L62,18 L72,28 L72,76 L16,76 Z M16,76 L34,90 L54,76 Z',
  ],
  photo: [
    // Camera body
    'M8,30 L24,30 L30,20 L62,20 L68,30 L88,30 L88,78 L8,78 Z M48,52 m-16,0 a16,16 0 1,0 32,0 a16,16 0 1,0 -32,0',
    // Picture frame with mountain
    'M8,16 L92,16 L92,84 L8,84 Z M18,26 L82,26 L82,74 L18,74 Z M22,68 L36,46 L48,58 L62,38 L78,68 Z',
  ],
  travel: [
    // Mountain range
    'M4,84 L24,40 L42,62 L62,28 L92,84 Z',
    // Paper plane
    'M6,52 L92,12 L70,56 L48,52 L60,84 Z M48,52 L70,56 L60,84 Z',
    // Compass
    'M50,12 a38,38 0 1,0 0,76 a38,38 0 1,0 0,-76 M50,24 L56,50 L50,76 L44,50 Z',
  ],
  game: [
    // Controller silhouette
    'M16,40 a14,14 0 0,1 14,-14 L70,26 a14,14 0 0,1 14,14 L84,62 a14,14 0 0,1 -14,14 L66,76 L60,66 L40,66 L34,76 L30,76 a14,14 0 0,1 -14,-14 Z',
    // Tilted die
    'M14,18 L70,18 L86,32 L86,86 L30,86 L14,72 Z M14,18 L30,32 L86,32 M30,32 L30,86',
    // Achievement star
    'M50,10 L60,40 L92,40 L66,58 L76,88 L50,68 L24,88 L34,58 L8,40 L40,40 Z',
  ],
  music: [
    // Eighth note
    'M40,14 L40,74 M40,74 a14,10 0 1,0 -2,-2 L38,76 Z M40,14 L80,24 L80,34 L40,24 Z',
    // Waveform
    'M4,50 L14,32 L24,68 L34,40 L44,60 L54,30 L64,68 L74,40 L84,60 L96,50 L96,54 L84,64 L74,44 L64,72 L54,34 L44,64 L34,44 L24,72 L14,36 L4,54 Z',
  ],
  food: [
    // Plate
    'M50,28 a30,30 0 1,0 0,60 a30,30 0 1,0 0,-60 M50,38 a20,20 0 1,0 0,40 a20,20 0 1,0 0,-40',
    // Apple
    'M50,30 C30,30 22,46 30,64 C36,78 48,84 50,80 C52,84 64,78 70,64 C78,46 70,30 50,30 Z M50,30 L52,18 L60,12',
  ],
  abstract: [
    // Soft circle
    'M50,14 a36,36 0 1,0 0,72 a36,36 0 1,0 0,-72 M50,26 a24,24 0 1,0 0,48 a24,24 0 1,0 0,-48',
    // Rounded triangle
    'M50,14 L86,80 L14,80 Z',
    // Plus / cross
    'M40,14 L60,14 L60,40 L86,40 L86,60 L60,60 L60,86 L40,86 L40,60 L14,60 L14,40 L40,40 Z',
  ],
};

function appMotifSvg(t: Theme, w: number, h: number, tokens: string[]): string {
  // Build the active glyph pool: matched tokens, falling back to abstract.
  const activeTokens = tokens.length ? tokens : ['abstract'];
  const glyphPool: string[] = [];
  for (const tk of activeTokens) {
    const g = MOTIF_GLYPHS[tk] ?? MOTIF_GLYPHS.abstract;
    glyphPool.push(...g);
  }

  // Deterministic scatter — 16 instances spread across the canvas at varied
  // sizes, rotations, and opacities. The pattern stays consistent within a
  // theme so re-renders are identical.
  const base = Math.min(w, h) * 0.18;
  const positions: Array<[number, number]> = [
    [0.08, 0.08], [0.32, 0.04], [0.62, 0.10], [0.88, 0.06],
    [0.04, 0.28], [0.22, 0.38], [0.78, 0.30], [0.94, 0.42],
    [0.10, 0.58], [0.30, 0.62], [0.70, 0.66], [0.90, 0.60],
    [0.06, 0.86], [0.28, 0.92], [0.56, 0.88], [0.82, 0.92],
  ];

  const glyphs = positions.map(([fx, fy], i) => {
    const sizeJitter = 0.65 + (i % 5) * 0.12;            // 0.65..1.13
    const size = base * sizeJitter;
    const rot = ((i * 53) % 60) - 30;                    // −30..+30 deg
    const op = 0.05 + (i % 3) * 0.025;                   // 0.05..0.10
    const glyph = glyphPool[i % glyphPool.length];
    const cx = fx * w;
    const cy = fy * h;
    const half = size / 2;
    return `<g transform="translate(${cx - half},${cy - half}) rotate(${rot} ${half} ${half}) scale(${size / 100})"
      opacity="${op}" fill="${t.headline_color}" fill-rule="evenodd"><path d="${glyph}"/></g>`;
  }).join('\n');

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="amBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="${t.bg_from}"/>
        <stop offset="100%" stop-color="${t.bg_to}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#amBg)"/>
    ${glyphs}
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
