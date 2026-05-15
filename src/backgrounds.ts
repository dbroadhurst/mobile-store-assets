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
  // Plugin-generic background styles. The `app-motif` style still produces a
  // motif scatter but uses an abstract glyph set only — the plugin no longer
  // knows or asserts what your app is about. AI background generation (via
  // gemini.ts) pulls subject context from user-authored hint/ASO data instead.
  switch (style) {
    case 'gradient':   return overlayMotif(gradientSvg(t, w, h),  t, w, h, 'sparse');
    case 'mesh':       return overlayMotif(meshSvg(t, w, h),      t, w, h, 'sparse');
    case 'bokeh':      return overlayMotif(bokehSvg(t, w, h),     t, w, h, 'sparse');
    case 'geometric':  return overlayMotif(geometricSvg(t, w, h), t, w, h, 'sparse');
    case 'minimal':    return minimalSvg(t, w, h);
    case 'app-motif':  return appMotifSvg(t, w, h);
  }
}

// Inject an abstract-glyph scatter group right before the closing </svg>.
// Sparse mode (8 glyphs, opacity 0.04–0.08) is the default for non-motif
// styles; dense mode (16 glyphs) is used by the app-motif style.
function overlayMotif(
  baseSvg: string,
  t: Theme,
  w: number,
  h: number,
  density: 'sparse' | 'dense',
): string {
  const fragment = motifScatterFragment(t, w, h, density);
  return baseSvg.replace(/<\/svg>\s*$/, `${fragment}</svg>`);
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

// Multi-blob mesh: stacked radial gradients in the brand palette plus a
// brighter accent highlight and a vignette edge-darken for depth. Approximates
// CSS mesh-gradient and gives flat themes a richer painterly feel.
function meshSvg(t: Theme, w: number, h: number): string {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="m1" cx="20%" cy="22%" r="55%">
        <stop offset="0%"  stop-color="${t.primary}"   stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${t.primary}"  stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="m2" cx="82%" cy="18%" r="60%">
        <stop offset="0%"  stop-color="${t.secondary}" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="${t.secondary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="m3" cx="55%" cy="85%" r="65%">
        <stop offset="0%"  stop-color="${t.bg_to}"     stop-opacity="0.90"/>
        <stop offset="100%" stop-color="${t.bg_to}"    stop-opacity="0"/>
      </radialGradient>
      <!-- Bright accent highlight — adds a sunburst pop the original 3-blob
           mesh lacked. Sits off the upper-right, smaller and brighter. -->
      <radialGradient id="m4" cx="68%" cy="38%" r="28%">
        <stop offset="0%"  stop-color="${t.accent}"    stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${t.accent}"   stop-opacity="0"/>
      </radialGradient>
      <!-- Vignette: subtle edge-darken so flat-feeling renders gain depth.
           Light at the centre, ~22% black at the corners. -->
      <radialGradient id="mVign" cx="50%" cy="55%" r="75%">
        <stop offset="60%"  stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.25)"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${t.bg_from}"/>
    <rect width="${w}" height="${h}" fill="url(#m1)"/>
    <rect width="${w}" height="${h}" fill="url(#m2)"/>
    <rect width="${w}" height="${h}" fill="url(#m3)"/>
    <rect width="${w}" height="${h}" fill="url(#m4)"/>
    <rect width="${w}" height="${h}" fill="url(#mVign)"/>
  </svg>`;
}

// Soft bokeh: blurred radial circles over a base gradient, plus a bright
// accent orb and a vignette edge-darken so the result feels painterly rather
// than flat-with-blurs.
function bokehSvg(t: Theme, w: number, h: number): string {
  // Deterministic circle positions (pseudo-random but seeded by canvas size).
  // Opacities bumped from the original 0.30–0.55 range so the bokeh actually
  // carries colour into the canvas centre — the earlier render of set C
  // was washing out under text.
  const circles = [
    { cx: w * 0.18, cy: h * 0.22, r: w * 0.18, fill: t.primary,   op: 0.60 },
    { cx: w * 0.74, cy: h * 0.30, r: w * 0.22, fill: t.secondary, op: 0.55 },
    { cx: w * 0.42, cy: h * 0.62, r: w * 0.30, fill: t.primary,   op: 0.45 },
    { cx: w * 0.86, cy: h * 0.78, r: w * 0.16, fill: t.bg_to,     op: 0.70 },
    { cx: w * 0.10, cy: h * 0.88, r: w * 0.14, fill: t.secondary, op: 0.60 },
    // Brighter accent orb upper-right — adds a "studio light" highlight.
    { cx: w * 0.78, cy: h * 0.12, r: w * 0.10, fill: t.accent,    op: 0.70 },
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
      <radialGradient id="bokehVign" cx="50%" cy="55%" r="75%">
        <stop offset="60%"  stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.30)"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bokehBg)"/>
    ${c}
    <rect width="${w}" height="${h}" fill="url(#bokehVign)"/>
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

// Abstract glyph library — universal, plugin-generic shapes. The renderer
// scatters these at low opacity behind layouts to give backgrounds a faint
// vector texture. We deliberately keep ONLY abstract shapes here; the plugin
// no longer ships category-specific glyphs (finance houses, civics flags,
// fitness pulses, etc.) because that bakes opinions about what apps exist.
// Category-specific imagery, when wanted, comes from AI background generation
// driven by the user's hint / ASO content.
//
// Each entry is path data on a 100×100 viewBox using `evenodd` fill so
// concentric strokes/holes render cleanly.
const ABSTRACT_GLYPHS: string[] = [
  // Soft concentric circle / ring
  'M50,14 a36,36 0 1,0 0,72 a36,36 0 1,0 0,-72 M50,26 a24,24 0 1,0 0,48 a24,24 0 1,0 0,-48',
  // Rounded triangle
  'M50,14 L86,80 L14,80 Z',
  // Plus / cross
  'M40,14 L60,14 L60,40 L86,40 L86,60 L60,60 L60,86 L40,86 L40,60 L14,60 L14,40 L40,40 Z',
  // Diamond / rotated square
  'M50,12 L88,50 L50,88 L12,50 Z',
  // Half-moon arc
  'M20,50 a30,30 0 1,1 60,0 a30,30 0 1,0 -60,0 Z',
];

function appMotifSvg(t: Theme, w: number, h: number): string {
  // app-motif style: gradient base + dense scatter of abstract glyphs.
  // Retained for backwards compatibility with specs that set `bg_style:
  // app-motif`; the resulting render is now plugin-generic (no app-category
  // imagery). Users who want category-specific motifs should use AI
  // background generation, which derives subjects from hint/ASO content.
  const glyphs = motifScatterFragment(t, w, h, 'dense');
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

// Deterministic scatter of abstract glyphs across the canvas. Sparse mode is
// for "primary aesthetic" background styles; dense mode is for the app-motif
// style itself.
function motifScatterFragment(
  t: Theme,
  w: number,
  h: number,
  density: 'sparse' | 'dense',
): string {
  const glyphPool = ABSTRACT_GLYPHS;

  const cfg = density === 'dense'
    ? { sizeBase: 0.18, opMin: 0.05, opStep: 0.025, count: 16 }
    : { sizeBase: 0.14, opMin: 0.04, opStep: 0.020, count: 8  };
  const base = Math.min(w, h) * cfg.sizeBase;

  // Position grid; sparse mode picks every other position for an airier feel.
  const positionsDense: Array<[number, number]> = [
    [0.08, 0.08], [0.32, 0.04], [0.62, 0.10], [0.88, 0.06],
    [0.04, 0.28], [0.22, 0.38], [0.78, 0.30], [0.94, 0.42],
    [0.10, 0.58], [0.30, 0.62], [0.70, 0.66], [0.90, 0.60],
    [0.06, 0.86], [0.28, 0.92], [0.56, 0.88], [0.82, 0.92],
  ];
  const positions = density === 'dense'
    ? positionsDense
    : positionsDense.filter((_, i) => i % 2 === 0);

  return positions.map(([fx, fy], i) => {
    const sizeJitter = 0.65 + (i % 5) * 0.12;             // 0.65..1.13
    const size = base * sizeJitter;
    const rot = ((i * 53) % 60) - 30;                     // −30..+30 deg
    const op = cfg.opMin + (i % 3) * cfg.opStep;
    const glyph = glyphPool[i % glyphPool.length];
    const cx = fx * w;
    const cy = fy * h;
    const half = size / 2;
    return `<g transform="translate(${cx - half},${cy - half}) rotate(${rot} ${half} ${half}) scale(${size / 100})"
      opacity="${op}" fill="${t.headline_color}" fill-rule="evenodd"><path d="${glyph}"/></g>`;
  }).join('\n');
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
