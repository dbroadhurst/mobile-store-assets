/**
 * WYSIWYG layout atlas generator.
 *
 * Renders every layout the dispatcher knows about at one canonical canvas
 * size each, with stock placeholder content, and assembles a single
 * `design/index.html` that shows the PNG output side-by-side with the layout
 * name. The atlas is a SOURCE-OF-TRUTH preview — what you see here is what
 * the pipeline will produce.
 *
 * Re-run:
 *   npx tsx design/build-preview.ts
 *
 * Outputs:
 *   design/preview/<layout>-<canvas>.png      one render per layout/canvas combo
 *   design/index.html                         atlas page
 *
 * NEVER edit the PNGs or index.html by hand — they're regenerated.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { captionBand } from '../src/layouts/caption-band.js';
import { heroType } from '../src/layouts/hero-type.js';
import { headlineMasthead } from '../src/layouts/headline-masthead.js';
import { featureStack } from '../src/layouts/feature-stack.js';
import { editorialCard } from '../src/layouts/editorial-card.js';
import { tiltedCard } from '../src/layouts/tilted-card.js';
import { verticalBento } from '../src/layouts/vertical-bento.js';
import { dualPhone } from '../src/layouts/dual-phone.js';
import { landscapeSplit } from '../src/layouts/landscape-split.js';
import { landscapeHero } from '../src/layouts/landscape-hero.js';
import { landscapeTextOnly } from '../src/layouts/landscape-text-only.js';
import { wearOs } from '../src/layouts/wear-os.js';
import { tvBanner } from '../src/layouts/tv-banner.js';
import { featureGraphic, FEATURE_GRAPHIC_VARIANTS } from '../src/layouts/feature-graphic.js';
import { shutdownBrowser } from '../src/render/browser.js';
import type { LayoutInput, Theme, StoreConfig, Layout } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'preview');
const TMP_DIR = path.join(__dirname, '.tmp');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// ─── Stock fixtures ─────────────────────────────────────────────────────────
// One synthetic background per orientation, one phone screenshot, one tablet
// screenshot, one icon. Re-used by every layout so the atlas only varies on
// layout shape, not on content.

async function makeBackground(w: number, h: number): Promise<Buffer> {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g1" cx="20%" cy="10%" r="80%">
        <stop offset="0%" stop-color="#ffb347" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#ffb347" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="g2" cx="90%" cy="90%" r="70%">
        <stop offset="0%" stop-color="#7cc4ff" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="#7cc4ff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a2540"/>
        <stop offset="100%" stop-color="#4f3a78"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g3)"/>
    <rect width="100%" height="100%" fill="url(#g1)"/>
    <rect width="100%" height="100%" fill="url(#g2)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function makeScreenshot(variant: 'phone' | 'tablet'): Promise<string> {
  const w = variant === 'phone' ? 1290 : 2048;
  const h = variant === 'phone' ? 2796 : 2732;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff8a5b"/>
        <stop offset="100%" stop-color="#ff4f8a"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#p)"/>
    <rect x="${w * 0.08}" y="${h * 0.14}" width="${w * 0.84}" height="${h * 0.22}" rx="60" fill="rgba(255,255,255,0.18)"/>
    <rect x="${w * 0.08}" y="${h * 0.40}" width="${w * 0.84}" height="${h * 0.18}" rx="60" fill="rgba(255,255,255,0.18)"/>
    <rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.84}" height="${h * 0.14}" rx="60" fill="rgba(255,255,255,0.18)"/>
  </svg>`;
  const out = path.join(TMP_DIR, `screenshot-${variant}.png`);
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}

async function makeIcon(): Promise<string> {
  const size = 1024;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffb347"/>
        <stop offset="100%" stop-color="#ff4f8a"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)"/>
    <text x="50%" y="58%" font-size="${size * 0.5}" font-weight="900" fill="white"
          text-anchor="middle" font-family="Arial, sans-serif">A</text>
  </svg>`;
  const out = path.join(TMP_DIR, 'icon.png');
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}

const THEME: Theme = {
  id: 'atlas',
  palette_name: 'aurora-night',
  primary: '#ffb347',
  secondary: '#7cc4ff',
  accent: '#ffb347',
  bg_from: '#1a2540',
  bg_to: '#4f3a78',
  bg_style: 'mesh',
  frame: 'none',
  scrim: 0.4,
  phone_top_offset: 0.08,
  headline_color: '#ffffff',
  subheadline_color: 'rgba(255,255,255,0.82)',
};

function makeConfig(iconPath: string, root: string): StoreConfig {
  return {
    app: {
      name: 'Atlas App',
      bundle_id: 'com.example.atlas',
      category: 'productivity',
      icon: path.relative(root, iconPath),
      platforms: ['ios', 'android'],
    },
    brand: {
      primary_color: '#ffb347',
      secondary_color: '#7cc4ff',
      background_gradient_from: '#1a2540',
      background_gradient_to: '#4f3a78',
      theme_motif: 'aurora',
    },
  };
}

// ─── Catalogue ──────────────────────────────────────────────────────────────
// Each entry pairs a layout with the canvas size + screenshot variant +
// content variant most representative of how it ships. Ordered by category
// so the atlas reads top-down: text-heavy, phone-heavy, rotation, multi-phone,
// landscape, special.

interface Variant {
  id: string;
  label: string;
  description: string;
  runner: (input: LayoutInput) => Promise<{ buffer: Buffer; zones: unknown[] }>;
  canvas: { name: string; width: number; height: number };
  screenshotVariant: 'phone' | 'tablet' | 'none';
  content: {
    headline: string;
    subheadline: string;
    features?: string[];
    badgeLabel?: string;
    badgeCount?: string;
  };
  layout: Layout;
}

const PHONE = { name: 'iphone-6.9 · 1320×2868', width: 1320, height: 2868 };
const TABLET = { name: 'ipad-13 · 2064×2752', width: 2064, height: 2752 };
const LANDSCAPE = { name: 'landscape · 2868×1320', width: 2868, height: 1320 };

const VARIANTS: Variant[] = [
  // Text-heavy
  {
    id: 'hero-type', label: 'hero-type', layout: 'hero-type',
    description: 'Icon + benefit headline panel + chip row. No phone.',
    runner: heroType, canvas: PHONE, screenshotVariant: 'none',
    content: {
      headline: 'Discover what you [LOVE]',
      subheadline: 'Hand-picked stories. Zero noise. Every morning.',
      features: ['Daily', 'Curated', 'Offline', 'Free'],
    },
  },
  {
    id: 'feature-stack', label: 'feature-stack', layout: 'feature-stack',
    description: '4 numbered feature rows + footer chip. No phone.',
    runner: featureStack, canvas: PHONE, screenshotVariant: 'none',
    content: {
      headline: 'Everything you need to read smarter.',
      subheadline: '',
      features: [
        'Discover — Daily picks from sources you trust',
        'Save — Offline reading on every device',
        'Highlight — Mark and share key passages',
        'Listen — Audio mode for any article',
      ],
      badgeLabel: 'reviews',
    },
  },
  // Phone hero
  {
    id: 'caption-band', label: 'caption-band', layout: 'caption-band',
    description: 'Phone hero + full-width soft-band caption.',
    runner: captionBand, canvas: PHONE, screenshotVariant: 'phone',
    content: {
      headline: 'Find feeds that match your interests',
      subheadline: 'Curated daily from sources you trust — no algorithm games.',
    },
  },
  {
    id: 'caption-band-tablet', label: 'caption-band · tablet', layout: 'caption-band',
    description: 'Same template on iPad — the slot adopts tablet aspect.',
    runner: captionBand, canvas: TABLET, screenshotVariant: 'tablet',
    content: {
      headline: 'Find feeds that match your interests',
      subheadline: 'Curated daily from sources you trust — no algorithm games.',
    },
  },
  {
    id: 'headline-masthead', label: 'headline-masthead', layout: 'headline-masthead',
    description: 'Top eyebrow chip + headline panel, phone fills the bottom.',
    runner: headlineMasthead, canvas: PHONE, screenshotVariant: 'phone',
    content: {
      headline: 'Read more.\nScroll less.',
      subheadline: '',
      badgeLabel: 'New',
    },
  },
  // Rotation
  {
    id: 'editorial-card', label: 'editorial-card', layout: 'editorial-card',
    description: 'Tilted phone clipping the top + bottom-left panel + accent rule.',
    runner: editorialCard, canvas: PHONE, screenshotVariant: 'phone',
    content: {
      headline: 'A daily ritual you actually keep',
      subheadline: 'Five minutes a morning. Real depth, no doomscrolling.',
      badgeLabel: 'Issue',
      badgeCount: '042',
    },
  },
  {
    id: 'tilted-card', label: 'tilted-card', layout: 'tilted-card',
    description: 'Phone inside a tilted white floating card + bottom panel.',
    runner: tiltedCard, canvas: PHONE, screenshotVariant: 'phone',
    content: {
      headline: 'Beautifully readable on every screen',
      subheadline: 'Crafted typography. Adaptive layout. Built to be loved.',
    },
  },
  // Grid / multi-phone
  {
    id: 'vertical-bento', label: 'vertical-bento', layout: 'vertical-bento',
    description: 'Headline strip + phone tile + two stat tiles.',
    runner: verticalBento, canvas: PHONE, screenshotVariant: 'phone',
    content: {
      headline: 'Built for speed and privacy.',
      subheadline: '',
      features: ['SPEED|3s|per entry', 'PRIVATE|100%|on device'],
    },
  },
  {
    id: 'dual-phone', label: 'dual-phone', layout: 'dual-phone',
    description: 'Two phones tilted toward each other + headline + chips.',
    runner: dualPhone, canvas: PHONE, screenshotVariant: 'phone',
    content: {
      headline: 'Light or dark — your call.',
      subheadline: 'Two themes. Same beautiful reading experience.',
      features: ['Auto-switch', 'OLED-friendly'],
    },
  },
  // Landscape
  {
    id: 'landscape-split', label: 'landscape-split', layout: 'landscape-split',
    description: 'Top text band + bottom phone band (landscape canvas).',
    runner: landscapeSplit, canvas: LANDSCAPE, screenshotVariant: 'phone',
    content: {
      headline: 'A wider lens on your reading.',
      subheadline: 'Side-by-side panels for research, study, and casual browsing.',
    },
  },
  {
    id: 'landscape-hero', label: 'landscape-hero', layout: 'landscape-hero',
    description: 'Centred uppercase headline + large centred phone.',
    runner: landscapeHero, canvas: LANDSCAPE, screenshotVariant: 'phone',
    content: {
      headline: 'See more. Read deeper.',
      subheadline: 'Designed for tablets and landscape mode.',
    },
  },
  {
    id: 'landscape-text-only', label: 'landscape-text-only', layout: 'landscape-text-only',
    description: 'Icon left + headline/subhead right. No phone.',
    runner: landscapeTextOnly, canvas: LANDSCAPE, screenshotVariant: 'none',
    content: {
      headline: 'Beautifully crafted, every word.',
      subheadline: 'No noise. No ads. Just stories worth your time.',
    },
  },
  // Special surfaces
  {
    id: 'wear-os', label: 'wear-os', layout: 'caption-band',
    description: 'Watch face — icon + first headline word at 384×384.',
    runner: wearOs, canvas: { name: 'wear-os · 384×384', width: 384, height: 384 },
    screenshotVariant: 'none',
    content: { headline: 'Read', subheadline: '' },
  },
  {
    id: 'tv-banner', label: 'tv-banner', layout: 'caption-band',
    description: 'Android TV listing banner — icon + app name + tagline at 1280×720.',
    runner: tvBanner, canvas: { name: 'android-tv-banner · 1280×720', width: 1280, height: 720 },
    screenshotVariant: 'none',
    content: { headline: '', subheadline: 'Stories worth your time.' },
  },
];

// ─── Render each variant ────────────────────────────────────────────────────

async function renderVariant(
  v: Variant,
  fixtures: { phoneShot: string; tabletShot: string; iconPath: string; root: string },
): Promise<{ filename: string; widthPx: number; heightPx: number; durationMs: number }> {
  const bg = await makeBackground(v.canvas.width, v.canvas.height);
  const screenshotPath = v.screenshotVariant === 'phone' ? fixtures.phoneShot
    : v.screenshotVariant === 'tablet' ? fixtures.tabletShot
    : null;
  const screenshotAspectRatio = v.screenshotVariant === 'phone' ? 2796 / 1290
    : v.screenshotVariant === 'tablet' ? 2732 / 2048
    : undefined;

  const input: LayoutInput = {
    background: bg,
    screenshotPath,
    screenshotAspectRatio,
    screenshot: {
      id: v.id,
      layout: v.layout,
      headline: v.content.headline,
      subheadline: v.content.subheadline,
      features: v.content.features,
      badge_label: v.content.badgeLabel,
      badge_count: v.content.badgeCount,
    },
    theme: THEME,
    config: makeConfig(fixtures.iconPath, fixtures.root),
    targetWidth: v.canvas.width,
    targetHeight: v.canvas.height,
    projectRoot: fixtures.root,
  };

  const t0 = Date.now();
  const result = await v.runner(input);
  const dt = Date.now() - t0;

  const filename = `${v.id}.png`;
  fs.writeFileSync(path.join(OUT_DIR, filename), result.buffer);
  return { filename, widthPx: v.canvas.width, heightPx: v.canvas.height, durationMs: dt };
}

// ─── Feature graphic — render all 3 variants ─────────────────────────────────

async function renderFeatureGraphic(
  fixtures: { phoneShot: string; tabletShot: string; iconPath: string; root: string },
): Promise<Array<{ id: string; label: string; description: string; filename: string; widthPx: number; heightPx: number; durationMs: number }>> {
  const W = 1024, H = 500;
  const bg = await makeBackground(W, H);
  const out: Array<{ id: string; label: string; description: string; filename: string; widthPx: number; heightPx: number; durationMs: number }> = [];

  for (const variant of FEATURE_GRAPHIC_VARIANTS) {
    const t0 = Date.now();
    const result = await featureGraphic({
      background: bg,
      phonePaths: [fixtures.phoneShot, fixtures.phoneShot, fixtures.phoneShot],
      headline: 'Stories worth your time, every day.',
      subline: 'Curated. Calm. Yours.',
      theme: THEME,
      variant,
      width: W,
      height: H,
    });
    const dt = Date.now() - t0;
    const filename = `feature-graphic-${variant}.png`;
    fs.writeFileSync(path.join(OUT_DIR, filename), result.buffer);
    out.push({
      id: `feature-graphic-${variant}`,
      label: `feature-graphic · ${variant}`,
      description: 'Google Play 1024×500 banner. Rotated per matrix set.',
      filename, widthPx: W, heightPx: H, durationMs: dt,
    });
  }
  return out;
}

// ─── HTML atlas ──────────────────────────────────────────────────────────────

interface RenderedCard {
  id: string;
  label: string;
  description: string;
  filename: string;
  widthPx: number;
  heightPx: number;
  durationMs: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildIndex(cards: RenderedCard[], generatedAt: string): string {
  const cardHtml = cards.map(c => `
    <figure class="card">
      <div class="frame">
        <img src="preview/${escapeHtml(c.filename)}" loading="lazy" alt="${escapeHtml(c.label)}" />
      </div>
      <figcaption>
        <h3>${escapeHtml(c.label)}</h3>
        <p class="meta">${c.widthPx}×${c.heightPx} · ${c.durationMs} ms</p>
        <p class="desc">${escapeHtml(c.description)}</p>
      </figcaption>
    </figure>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>mobile-store-assets · layout atlas</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --ink: #1a2330;
    --ink-2: #4b5566;
    --line: #e2e6ee;
    --bg: #f6f7fb;
    --accent: #5c6bff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--ink); }
  body { font: 15px/1.55 -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif; }

  header { padding: 36px 40px 20px; background: #fff; border-bottom: 1px solid var(--line); }
  header h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: -0.01em; }
  header .meta { color: var(--ink-2); font-size: 13px; }
  header code { background: #eef1f8; padding: 1px 6px; border-radius: 3px; font-size: 12px; }

  main {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 28px;
    padding: 28px 40px 64px;
  }

  .card {
    margin: 0;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .frame {
    background: #f2f3f8;
    padding: 22px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 420px;
  }
  .frame img {
    max-width: 100%;
    max-height: 640px;
    height: auto;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.10);
  }
  figcaption { padding: 16px 18px 20px; }
  figcaption h3 { margin: 0 0 4px; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
  .meta { margin: 0 0 8px; font-size: 12px; color: var(--accent); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  .desc { margin: 0; font-size: 13px; color: var(--ink-2); line-height: 1.5; }

  .note {
    background: #fffbe9;
    border-top: 1px solid var(--line);
    padding: 14px 40px;
    font-size: 13px;
    color: #6b5a14;
  }
</style>
</head>
<body>
  <header>
    <h1>mobile-store-assets · layout atlas</h1>
    <p class="meta">
      WYSIWYG preview of every layout the pipeline ships. Each image is rendered by the
      <em>same</em> JSX template the CLI uses — no separate mock content.
      Regenerate with <code>npx tsx design/build-preview.ts</code>. Last built: ${escapeHtml(generatedAt)}.
    </p>
  </header>
  <main>
    ${cardHtml}
  </main>
  <p class="note">
    These PNGs are committed for fast browser previews. They are stale the moment a layout
    file changes — rebuild after edits so the atlas keeps matching the renderer.
  </p>
</body>
</html>
`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Rendering atlas…');
  const phoneShot = await makeScreenshot('phone');
  const tabletShot = await makeScreenshot('tablet');
  const iconPath = await makeIcon();
  const root = __dirname;

  const cards: RenderedCard[] = [];
  for (const v of VARIANTS) {
    const r = await renderVariant(v, { phoneShot, tabletShot, iconPath, root });
    cards.push({ id: v.id, label: v.label, description: v.description, ...r });
    console.log(`  ✓ ${v.id.padEnd(28)} ${r.widthPx}×${r.heightPx}  ${r.durationMs} ms`);
  }

  const fg = await renderFeatureGraphic({ phoneShot, tabletShot, iconPath, root });
  cards.push(...fg);
  for (const c of fg) {
    console.log(`  ✓ ${c.id.padEnd(28)} ${c.widthPx}×${c.heightPx}  ${c.durationMs} ms`);
  }

  const html = buildIndex(cards, new Date().toISOString().slice(0, 16).replace('T', ' '));
  fs.writeFileSync(path.join(__dirname, 'index.html'), html);
  console.log(`\n  ✓ wrote design/index.html (${cards.length} cards)`);

  await shutdownBrowser();
}

main().catch(err => {
  console.error(err);
  shutdownBrowser().finally(() => process.exit(1));
});
