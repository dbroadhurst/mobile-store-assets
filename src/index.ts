import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import sharp from 'sharp';

import type {
  Spec,
  StoreConfig,
  Platform,
  LayoutInput,
  ScreenshotSpec,
  ProviderId,
  SetSpec,
  Theme,
} from './types.js';
import { requiresScreenshot } from './types.js';
import { PLATFORMS, FEATURE_GRAPHIC, DEFAULT_LOCALE } from './config.js';
import {
  generateBackground,
  generateFeatureGraphicBg,
  sizeKey,
  type Provider,
  type OpenAIQuality,
} from './gemini.js';
import { resizeBg, escapeXml, fitText, screenshotAspect, makeDeviceFrame, stripBrackets, TEXT_SHADOW_DEFS } from './helpers.js';
import { layoutForSet } from './story-arc.js';
import { textHero } from './layouts/text-hero.js';
import { captionBelow } from './layouts/caption-below.js';
import { uppercaseTop } from './layouts/uppercase-top.js';
import { logoTilted } from './layouts/logo-tilted.js';
import { highlightPill } from './layouts/highlight-pill.js';
import { sideList } from './layouts/side-list.js';
import { cardTilted } from './layouts/card-tilted.js';
import { dualPhoneOverlap } from './layouts/dual-phone.js';
import { wearOs } from './layouts/wear-os.js';
import { tvBanner } from './layouts/tv-banner.js';
import { landscapeSplit } from './layouts/landscape-split.js';
import { landscapeHero } from './layouts/landscape-hero.js';
import { landscapeTextOnly } from './layouts/landscape-text-only.js';
import { BackgroundCache } from './cache.js';
import { writeStoreListings } from './listing.js';
import { extractTheme } from './colors.js';
import { renderBackground } from './backgrounds.js';
import { resolveSets, resolveScreenshot, parseSetsArg } from './matrix.js';
import { writeReviewFiles, type ManifestItem } from './review.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CliArgs {
  version: string;
  projectRoot: string;
  specPath: string;
  configPath: string;
  screenshotsDir: string;
  outputDir: string;
  platforms: (Platform | 'all')[];
  imagesOnly: boolean;
  textOnly: boolean;
  dryRun: boolean;
  /** Whether AI backgrounds will actually be used (decided at run time). */
  useAiBg: boolean;
  /** Original flag values, before the auto-detect logic resolves them. */
  useAiBgFlag: boolean;
  cssBgFlag: boolean;
  providerOverride?: ProviderId;
  regenIds: string[];
  locales: string[];
  includeIphone6_5: boolean;
  /** Raw --include-<key> tokens (e.g. ["6.7", "wear", "tv-banner"]) */
  includeKeys: string[];
  includeAll: boolean;
  setsArg?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
  const has = (flag: string) => args.includes(flag);

  const projectRoot  = get('--root')        ?? process.cwd();
  const version      = get('--version')     ?? detectLatestVersion(projectRoot);
  const specPath     = get('--spec')        ?? `marketing/releases/${version}/spec.yaml`;
  const configPath   = get('--config')      ?? 'marketing/.store-config.yaml';
  const screenshotsDir = get('--screenshots') ?? `marketing/releases/${version}/screenshots`;
  const outputDir    = get('--output')      ?? `marketing/releases/${version}/output`;
  const platforms    = (get('--platform') ?? 'all').split(',').map(s => s.trim()) as (Platform | 'all')[];
  const imagesOnly   = has('--images-only');
  const textOnly     = has('--text-only');
  const dryRun       = has('--dry-run');
  // AI backgrounds. The user can force either path:
  //   --use-ai-bg  forces AI even when keys are absent (will error)
  //   --css-bg     forces CSS/SVG even when keys are present
  // When neither flag is set, the runtime decides: AI if keys are configured,
  // CSS otherwise. This matches the user's mental model — having keys means
  // you want them used.
  const useAiBgFlag  = has('--use-ai-bg');
  const cssBgFlag    = has('--css-bg');
  const providerArg  = get('--provider');
  const providerOverride = (providerArg === 'openai' || providerArg === 'google') ? providerArg : undefined;

  const regenRaw  = get('--regen') ?? '';
  const regenIds  = regenRaw === ''     ? []
                  : regenRaw === 'all'  ? ['*']
                  : regenRaw.split(',').map(s => s.trim()).filter(Boolean);

  const locales   = (get('--locales') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  // --include-<key> turns on opt-in platforms. --include-all turns on every
  // non-default platform (legacy iOS sizes, 7" tablet, Wear OS, TV banner).
  const includeAll = has('--include-all');
  const includes = new Set<string>();
  for (const a of args) {
    const m = /^--include-(.+)$/.exec(a);
    if (m) includes.add(m[1]);
  }
  const includeIphone6_5 = includes.has('6.5') || includes.has('iphone-6.5') || includeAll;

  const setsArg = get('--sets');

  return {
    version, projectRoot, specPath, configPath, screenshotsDir, outputDir,
    platforms, imagesOnly, textOnly, dryRun,
    // useAiBg is finalised in main() once we know whether keys exist
    useAiBg: false,
    useAiBgFlag, cssBgFlag,
    providerOverride, regenIds,
    locales, includeIphone6_5, setsArg,
    includeKeys: [...includes],
    includeAll,
  };
}

function detectLatestVersion(projectRoot: string): string {
  const releasesDir = path.join(projectRoot, 'marketing', 'releases');
  try {
    const dirs = fs.readdirSync(releasesDir).filter(d =>
      fs.statSync(path.join(releasesDir, d)).isDirectory()
    );
    if (dirs.length === 0) throw new Error('No releases found');
    return dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!;
  } catch {
    console.error('✖  No --version supplied and no releases found in marketing/releases/');
    process.exit(1);
  }
}

function loadYaml<T>(p: string): T {
  return yaml.load(fs.readFileSync(p, 'utf8')) as T;
}

function pickProvider(
  envPath: string,
  override?: ProviderId,
  fromConfig?: ProviderId,
): { provider: Provider; apiKey: string } | null {
  let raw: string;
  try { raw = fs.readFileSync(envPath, 'utf8'); } catch { return null; }

  const keys: Record<ProviderId, string | null> = { openai: null, google: null };
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '').trim();
    if (!v) continue;
    if (k === 'OPENAI_API_KEY')    keys.openai = v;
    if (k === 'GOOGLE_AI_API_KEY') keys.google = v;
  }

  const preferred: ProviderId[] = [];
  if (override) preferred.push(override);
  if (fromConfig && fromConfig !== override) preferred.push(fromConfig);

  for (const p of preferred) {
    if (keys[p]) return { provider: p, apiKey: keys[p]! };
  }
  if (keys.openai) return { provider: 'openai', apiKey: keys.openai };
  if (keys.google) return { provider: 'google', apiKey: keys.google };
  return null;
}

// Map internal Platform enum → human-readable label used in the manifest /
// review.html. This keeps the on-disk JSON consistent with what the review
// page CSS targets and avoids leaking internal naming to the user.
function manifestPlatformLabel(p: Platform): string {
  switch (p) {
    case 'ios-phone':         return 'iphone-6.9';
    case 'ios-phone-6.7':     return 'iphone-6.7';
    case 'ios-phone-6.5':     return 'iphone-6.5';
    case 'ios-tablet':        return 'ipad-pro-12.9';
    case 'ios-tablet-13':     return 'ipad-pro-13';
    case 'android-phone':     return 'android-phone';
    case 'android-tablet':    return 'android-tablet';
    case 'android-7-tablet':  return 'android-7-tablet';
    case 'wear-os':           return 'wear-os';
    case 'android-tv-banner': return 'android-tv-banner';
    default:                  return p;
  }
}

// ─── Layout dispatcher ────────────────────────────────────────────────────────

async function renderLayout(input: LayoutInput, platform: Platform): Promise<Buffer> {
  // Special-purpose surfaces ignore the spec's `layout` field — Wear OS and
  // the TV banner have fixed compositions because phone-screenshot layouts
  // don't make sense at 1:1 watch size or 16:9 banner.
  if (platform === 'wear-os')           return wearOs(input);
  if (platform === 'android-tv-banner') return tvBanner(input);

  switch (input.screenshot.layout) {
    // Portrait
    case 'text-hero':           return textHero(input);
    case 'caption-below':       return captionBelow(input);
    case 'uppercase-top':       return uppercaseTop(input);
    case 'logo-tilted':         return logoTilted(input);
    case 'highlight-pill':      return highlightPill(input);
    case 'side-list':           return sideList(input);
    case 'card-tilted':         return cardTilted(input);
    case 'dual-phone-overlap':  return dualPhoneOverlap(input);
    // Landscape
    case 'landscape-split':     return landscapeSplit(input);
    case 'landscape-hero':      return landscapeHero(input);
    case 'landscape-text-only': return landscapeTextOnly(input);
    default:                    return textHero(input);
  }
}

// ─── Source resolution ────────────────────────────────────────────────────────

function resolveScreenshotPath(
  ssDir: string,
  ss: ScreenshotSpec,
  platform: Platform,
  layout: ScreenshotSpec['layout'],
): string | null {
  // Only resolve for layouts that actually need a phone. Anything else
  // (text-hero, unknown legacy names) falls through here without a source.
  if (!requiresScreenshot(layout)) return null;

  const direct = ss.sources?.[platform];
  if (direct) {
    const p = path.join(ssDir, platform, direct);
    if (fs.existsSync(p)) return p;
  }

  const fallback = PLATFORMS[platform].fallbackSourceFrom;
  if (fallback) {
    const fbName = ss.sources?.[fallback];
    if (fbName) {
      const p = path.join(ssDir, fallback, fbName);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// ─── Background acquisition ───────────────────────────────────────────────────
// One background per (theme × orientation), not per (set × screenshot × platform).
//
// 4 themes × 2 orientations = 8 unique backgrounds for the entire matrix.
// Each canvas size receives the same source background, centre-cropped to fit
// via sharp's `cover + centre` resize. Backgrounds are brand decoration — they
// don't need to differ per screenshot, and reusing them dramatically cuts AI
// cost and time (was: 80 calls; now: 8).
//
// AI prompts are intentionally pushed toward GRAPHIC / illustrative output —
// vector-style, flat color, abstract shapes — and away from photo-realism.

type Orientation = 'portrait' | 'landscape';

function orientationFor(aspectRatio: string): Orientation {
  return aspectRatio === '16:9' ? 'landscape' : 'portrait';
}

// Source dimensions for the canonical background of each orientation. Chosen
// large enough that any platform canvas can be cover-cropped without upscaling
// past comfortable sharpness for graphic/illustrative content.
const ORIENTATION_DIMS: Record<Orientation, { w: number; h: number; aspectRatio: string }> = {
  portrait:  { w: 1280, h: 2560, aspectRatio: '9:16' },
  landscape: { w: 2048, h: 1024, aspectRatio: '16:9' },
};

const PHOTO_NEGATIVE =
  'flat vector illustration style, abstract graphic design, no photograph, ' +
  'no realistic objects, no people, no UI elements, no text, no letters, no numbers, no logos';

// Composition rule that must apply to every background — text overlays the
// upper-third (uppercase-top, caption-below, highlight-pill) and lower-third
// (side-list, dual-phone), so the centre carries the visual interest.
const TEXT_SAFE_DIRECTIVE =
  'open uncluttered space at the top and bottom for headline text overlay, ' +
  'visual interest concentrated in the centre, soft and subtle around the edges';

function graphicStylePrompt(theme: Theme, app: AppContext): string {
  // Per-bg-style prompt seeds. Each describes a graphic/illustrative composition
  // and references the theme palette by NAME (never hex — Imagen treats hex as
  // text and renders it visibly). The `app` block injects what the app actually
  // does so backgrounds carry brand-relevant motifs (e.g. "subtle home and key
  // silhouettes" for a mortgage app), tuned text-safe so headlines stay
  // readable on top.
  const motif = app.motifPhrase ? `, evoking ${app.motifPhrase}` : '';
  const palette = theme.palette_name;
  switch (theme.bg_style) {
    case 'gradient':
      return `Soft abstract gradient wash blending ${palette}${motif}, smooth flat color field, minimal modern composition. ${TEXT_SAFE_DIRECTIVE}`;
    case 'mesh':
      return `Abstract mesh-gradient composition with smooth color blends in ${palette}${motif}, flowing organic forms, modern flat design. ${TEXT_SAFE_DIRECTIVE}`;
    case 'bokeh':
      return `Abstract bokeh-style illustration with soft blurred color blobs in ${palette}${motif}, dreamy minimal vector look. ${TEXT_SAFE_DIRECTIVE}`;
    case 'geometric':
      return `Minimalist geometric abstract composition, simple overlapping shapes in ${palette}${motif}, flat vector design, modern aesthetic. ${TEXT_SAFE_DIRECTIVE}`;
    case 'minimal':
      return `Minimal flat color field in ${palette}${motif} with subtle radial vignette, clean modern design. ${TEXT_SAFE_DIRECTIVE}`;
    case 'app-motif':
      return `Minimal abstract composition in ${palette}${motif}, faint line-art vector silhouettes scattered as a watermark, soft modern illustration. ${TEXT_SAFE_DIRECTIVE}`;
  }
}

// Light-touch context derived from the spec + config. Produces both a natural-
// language phrase (for AI prompts) and a set of motif tokens (for the CSS
// `app-motif` background renderer, which keys faint vector glyphs by token).
interface AppContext {
  motifPhrase: string;
  motifTokens: string[];
}

function buildAppContext(spec: Spec, config: StoreConfig): AppContext {
  const category = (config.app.category ?? '').trim().toLowerCase();
  const keywords = [
    ...(spec.aso?.primary_keywords ?? []),
    ...(spec.aso?.secondary_keywords ?? []),
  ].map(k => k.toLowerCase());
  const positioning = (spec.aso?.positioning ?? '').toLowerCase();
  const hint = (spec.hint ?? '').toLowerCase();

  // Curated motif map — pairs a topic *token* (used by the CSS app-motif glyph
  // library) with a longer phrase (used by AI prompts). The same regex haystack
  // drives both so they stay in sync. Categories not matched fall through to
  // 'abstract' shapes.
  const haystack = `${category} ${keywords.join(' ')} ${positioning} ${hint}`;
  const tokens: string[] = [];
  const phrases: string[] = [];
  const add = (token: string, phrase: string) => {
    if (!tokens.includes(token)) { tokens.push(token); phrases.push(phrase); }
  };

  if (/mortgage|loan|finance|home|property|real estate|car loan|repayment|interest/.test(haystack))
    add('finance', 'houses, keys, gentle architectural silhouettes, financial planning');
  if (/budget|spend|money|expense|saving|invest/.test(haystack))
    add('money', 'coins, charts, growth curves, abstract money flow');
  if (/health|fitness|workout|exercise|run|step/.test(haystack))
    add('fitness', 'movement, soft pulses, energy lines');
  if (/meditat|mindful|sleep|calm|breath/.test(haystack))
    add('meditation', 'soft waves, gentle ripples, calm horizon lines');
  if (/learn|education|study|language|quiz/.test(haystack))
    add('learning', 'open books, paths, growth arcs');
  if (/photo|camera|gallery|art/.test(haystack))
    add('photo', 'frames, light leaks, soft prisms');
  if (/travel|trip|map|navigation/.test(haystack))
    add('travel', 'soft maps, paths, distant horizons');
  if (/game|puzzle|quest|adventure|arcade|rpg/.test(haystack))
    add('game', 'controllers, dice, abstract play tokens');
  if (/music|sound|audio|listen|playlist|song/.test(haystack))
    add('music', 'notes, waveforms, soft rhythm lines');
  if (/food|recipe|cook|meal|nutrition|kitchen/.test(haystack))
    add('food', 'plates, utensils, fresh produce silhouettes');

  const motifPhrase = phrases.length > 0
    ? phrases.join(' and ')
    : 'modern minimal abstraction';

  return { motifPhrase, motifTokens: tokens };
}

interface BgArgs {
  args: CliArgs;
  cache: BackgroundCache;
  set: SetSpec;
  theme: Theme;
  orientation: Orientation;
  provider: Provider;
  model: string;
  apiKey: string;
  quality: OpenAIQuality;
  appContext: AppContext;
  /** In-memory bucket cache so a single run reuses the same buffer across platforms. */
  bucket: Map<string, Buffer>;
}

async function acquireBackground(b: BgArgs): Promise<Buffer> {
  // Cache key for the run. (theme.id × orientation × ai/css) — exactly 8 entries
  // for a default ABCD matrix.
  const memKey = `${b.theme.id}|${b.orientation}|${b.args.useAiBg ? 'ai' : 'css'}`;
  const memHit = b.bucket.get(memKey);
  if (memHit) return memHit;

  const dims = ORIENTATION_DIMS[b.orientation];

  // CSS/SVG path: deterministic from theme — render once at the canonical size.
  // App-motif tokens flow in so the `app-motif` bg style picks the right glyphs.
  if (!b.args.useAiBg) {
    const buf = await renderBackground(b.theme, dims.w, dims.h, b.appContext.motifTokens);
    b.bucket.set(memKey, buf);
    return buf;
  }

  // AI path. Prompt is theme-driven (graphic/illustrative seeds) AND app-aware
  // (motifs derived from spec.aso). Disk cache key drops the per-platform size
  // — same theme + orientation reuses across all platforms in this and future
  // runs. Caches also invalidate when the prompt changes (incl. motif phrase).
  const prompt = graphicStylePrompt(b.theme, b.appContext);
  const fullPrompt = `${prompt}. ${b.theme.palette_name}. ${PHOTO_NEGATIVE}`;
  const diskKey = b.cache.key(b.provider, b.model, dims.aspectRatio, fullPrompt);

  const forced = b.cache.shouldForce(b.theme.id) || b.cache.shouldForce(b.set.id) || b.cache.shouldForce('all');
  let buf: Buffer | null = null;
  if (!forced) {
    buf = b.cache.read(diskKey);
    if (buf) console.log(`    ✓  cache hit (${diskKey})`);
  }
  if (!buf) {
    buf = await generateBackground({
      provider: b.provider, model: b.model, apiKey: b.apiKey,
      prompt: fullPrompt, aspectRatio: dims.aspectRatio, quality: b.quality,
      label: `${b.set.id}/${b.theme.id} (${b.orientation})`,
    });
    b.cache.write(diskKey, buf);
  }
  b.bucket.set(memKey, buf);
  return buf;
}

// ─── Feature graphic ──────────────────────────────────────────────────────────

async function buildFeatureGraphic(
  args: CliArgs,
  cache: BackgroundCache,
  provider: Provider,
  model: string,
  apiKey: string,
  spec: Spec,
  config: StoreConfig,
  outputDir: string,
  quality: OpenAIQuality,
  theme: Theme,
  set: SetSpec,
  bucket: Map<string, Buffer>,
  appContext: AppContext,
): Promise<void> {
  const { width, height } = FEATURE_GRAPHIC;
  console.log('  Generating feature graphic...');

  // Reuse the landscape background generated for this theme.
  const bgRaw = await acquireBackground({
    args, cache, set, theme,
    orientation: 'landscape',
    provider, model, apiKey, quality,
    appContext, bucket,
  });
  const bg = await resizeBg(bgRaw, width, height);

  // ── Best-practice rules baked into the layout ──────────────────────────────
  // • Lead with a benefit headline (5–8 words). NOT the app name — Play shows
  //   the app name adjacent to the graphic, so repeating it is wasted pixels
  //   and Google flags icon-style branding as duplication.
  // • Featured screenshot (slot 0 / "value") as the visual focal point on the
  //   right, slightly tilted for energy. Tells the category in < 1 second.
  // • 70 px safe margins on every edge (crop zones differ per surface).
  // • Centre kept reasonably clear so a future promo-video play-button overlay
  //   doesn't obscure critical content.
  // • Theme background + accent + text-shadow halo for thumbnail legibility.
  //   Sources: Apptamin, Gummicube, ScreenshotWhale ASO best-practice guides.
  const SAFE = 70;

  // Pick the strongest copy: first screenshot's headline (value slot is
  // authored as the listing's hero promise). Fall back through app_store text.
  const valueSs = spec.screenshots[0];
  const valueOverride = valueSs ? set.screenshots[valueSs.id] : undefined;
  const promoHeadline =
    valueOverride?.headline ??
    valueSs?.headline ??
    spec.app_store.promotional_text ??
    spec.app_store.subtitle ??
    config.app.name;
  const headline = stripBrackets(promoHeadline);
  const subline  = spec.app_store.subtitle && spec.app_store.subtitle !== headline
    ? spec.app_store.subtitle
    : (spec.app_store.promotional_text && spec.app_store.promotional_text !== headline
        ? spec.app_store.promotional_text
        : '');

  // Resolve a featured screenshot. Prefer android-phone (this is a Play asset);
  // fall back through ios-phone / other landscape variants for landscape apps.
  const ssDir = path.join(args.projectRoot, args.screenshotsDir);
  const sourcePicks: Array<{ platform: string; folder: string }> = [
    { platform: 'android-phone',  folder: 'android-phone'  },
    { platform: 'ios-phone',      folder: 'ios-phone'      },
    { platform: 'android-tablet', folder: 'android-tablet' },
    { platform: 'ios-tablet',     folder: 'ios-tablet'     },
  ];
  let phonePath: string | null = null;
  for (const pick of sourcePicks) {
    const file = valueSs?.sources?.[pick.platform as Platform];
    if (!file) continue;
    const abs = path.join(ssDir, pick.folder, file);
    if (fs.existsSync(abs)) { phonePath = abs; break; }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  // Left column: headline + optional sub-line, left-aligned, vertically
  // centred. Right column: tilted phone (when a source exists) or a soft
  // visual block (when not).
  const phoneTilt = -5;                          // degrees, clockwise negative
  const phoneAreaW = Math.floor(width * 0.34);   // ~348 px
  const textRight  = phoneAreaW > 0
    ? width - phoneAreaW - Math.floor(width * 0.04)
    : width - SAFE;
  const textLeft   = SAFE;
  const textSafe   = textRight - textLeft;

  const headlineLines = wrapByLen(headline, 24).slice(0, 2);
  const headlineSz = fitText(longestLine(headlineLines), textSafe, Math.floor(height * 0.22), 0.62);
  const headLineH  = Math.floor(headlineSz * 1.08);
  const sublineSz  = subline
    ? fitText(subline, textSafe, Math.floor(height * 0.085), 0.55)
    : 0;
  const gap = Math.floor(height * 0.04);
  const totalTextH = headlineLines.length * headLineH + (subline ? gap + sublineSz : 0);
  const textTop = Math.floor((height - totalTextH) / 2);

  const headlineSvg = headlineLines.map((line, i) =>
    `<text x="${textLeft}" y="${textTop + (i + 1) * headLineH - Math.floor(headLineH * 0.18)}"
      font-family="Arial,Helvetica,sans-serif" font-size="${headlineSz}" font-weight="800"
      fill="${theme.headline_color}">${escapeXml(line)}</text>`
  ).join('\n');
  const sublineSvg = subline
    ? `<text x="${textLeft}" y="${textTop + headlineLines.length * headLineH + gap + sublineSz}"
        font-family="Arial,Helvetica,sans-serif" font-size="${sublineSz}" font-weight="400"
        fill="${theme.subheadline_color}">${escapeXml(subline)}</text>`
    : '';

  const overlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${TEXT_SHADOW_DEFS}
    ${headlineSvg}
    ${sublineSvg}
  </svg>`;

  // Build phone layer (tilted) if we have a source.
  const composites: sharp.OverlayOptions[] = [];
  if (phonePath) {
    const aspect = await screenshotAspect(phonePath);
    const isLandscape = aspect < 1;
    // Allow room for the tilt rotation (sharp's rotate expands the canvas).
    const phoneAvailH = height - SAFE * 2;
    let phoneH = isLandscape
      ? Math.min(phoneAvailH, Math.floor(phoneAreaW * aspect))
      : phoneAvailH;
    let phoneW = Math.round(phoneH / aspect);
    if (phoneW > phoneAreaW) {
      phoneW = phoneAreaW;
      phoneH = Math.round(phoneW * aspect);
    }
    const frame = await makeDeviceFrame(phonePath, phoneW, phoneH, 0, 0, 'top', 'cover');
    const tilted = await sharp(frame)
      .rotate(phoneTilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const tMeta = await sharp(tilted).metadata();
    const tW = tMeta.width ?? phoneW;
    const tH = tMeta.height ?? phoneH;
    const phoneLeft = width - phoneAreaW - Math.floor(width * 0.02) + Math.floor((phoneAreaW - tW) / 2);
    const phoneTop  = Math.floor((height - tH) / 2);
    composites.push({ input: tilted, top: phoneTop, left: phoneLeft });
  }
  composites.push({ input: Buffer.from(overlay), top: 0, left: 0 });

  const outPath = path.join(outputDir, 'google-play', 'feature-graphic.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Output as 24-bit PNG (no alpha) — Play rejects transparency on this asset.
  await sharp(bg).composite(composites).flatten({ background: '#000000' }).png().toFile(outPath);
  console.log(`  ✓  feature-graphic.png (${width}×${height})`);
}

function wrapByLen(text: string, target: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > target && cur) { lines.push(cur); cur = w; } else { cur = next; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function longestLine(lines: string[]): string {
  return lines.reduce((a, b) => a.length > b.length ? a : b, '');
}

// ─── Subcommand: extract theme ────────────────────────────────────────────────

async function runExtractTheme(imagePath: string): Promise<void> {
  if (!fs.existsSync(imagePath)) {
    console.error(`✖  Screenshot not found: ${imagePath}`);
    process.exit(1);
  }
  const theme = await extractTheme(imagePath);
  console.log([
    `primary_color: "${theme.primaryHex}"`,
    `secondary_color: "${theme.secondaryHex}"`,
    `primary_color_name: "${theme.primaryName}"`,
    `secondary_color_name: "${theme.secondaryName}"`,
    `# Imagen-safe theme phrase (no hex codes):`,
    `theme_motif: "Soft gradient wash from ${theme.primaryName} to ${theme.secondaryName}, premium minimalist composition, no text, no numbers, no letters, no words"`,
  ].join('\n'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Subcommand dispatch
  const themeFlag = process.argv.indexOf('--extract-theme');
  if (themeFlag !== -1) {
    const imgPath = process.argv[themeFlag + 1];
    if (!imgPath) {
      console.error('✖  --extract-theme requires a screenshot path');
      process.exit(1);
    }
    await runExtractTheme(imgPath);
    return;
  }

  const args = parseArgs();

  const envPath = path.join(args.projectRoot, 'marketing', '.env.local');
  dotenv.config({ path: envPath });

  const spec: Spec     = loadYaml(path.join(args.projectRoot, args.specPath));
  const config: StoreConfig = loadYaml(path.join(args.projectRoot, args.configPath));

  // ── Decide AI vs CSS background path ────────────────────────────────────
  // Auto-detect: AI when keys are configured (unless --css-bg overrides).
  //              CSS when no keys (unless --use-ai-bg insists, which errors).
  let provider: Provider = 'openai';
  let apiKey  = '';
  let model: string;
  let useAiBg = false;

  if (!args.dryRun) {
    const detected = pickProvider(envPath, args.providerOverride, config.default_provider);
    if (args.useAiBgFlag && !detected) {
      console.error('✖  --use-ai-bg requires OPENAI_API_KEY or GOOGLE_AI_API_KEY in marketing/.env.local');
      process.exit(1);
    }
    if (args.cssBgFlag) {
      useAiBg = false;
    } else if (args.useAiBgFlag) {
      useAiBg = true;
    } else {
      // No explicit flag — use AI when keys are present (the user's mental model)
      useAiBg = !!detected;
    }
    if (useAiBg && detected) {
      provider = detected.provider;
      apiKey   = detected.apiKey;
    }
  }
  args.useAiBg = useAiBg;

  model = provider === 'openai'
    ? (config.openai?.model ?? 'gpt-image-1')
    : (config.imagen?.model ?? 'imagen-4.0-fast-generate-001');
  const quality: OpenAIQuality = config.openai?.quality ?? 'medium';

  const ssDir  = path.join(args.projectRoot, args.screenshotsDir);
  const outDir = path.join(args.projectRoot, args.outputDir);

  // Active platforms.
  // - --platform a,b,c: explicit list (overrides everything)
  // - --platform all (default): every default-enabled platform
  // - --include-<key>: turns on a specific opt-in platform
  // - --include-all: turns on every opt-in platform
  const allPlatforms = Object.keys(PLATFORMS) as Platform[];
  let activePlatforms: Platform[];
  if (args.platforms.includes('all')) {
    activePlatforms = allPlatforms.filter(p => PLATFORMS[p].defaultEnabled);
    // Resolve --include-<key> into platforms
    const { INCLUDE_FLAG_MAP } = await import('./config.js');
    const addPlatform = (p: Platform) => {
      if (!activePlatforms.includes(p)) activePlatforms.push(p);
    };
    for (const key of args.includeKeys) {
      const platforms = INCLUDE_FLAG_MAP[key];
      if (platforms) platforms.forEach(addPlatform);
    }
    if (args.includeAll) {
      allPlatforms.filter(p => !PLATFORMS[p].defaultEnabled).forEach(addPlatform);
    }
  } else {
    activePlatforms = allPlatforms.filter(p => args.platforms.includes(p));
  }

  // Locales
  const locales = args.locales.length > 0 ? args.locales : [DEFAULT_LOCALE];

  // Sets
  const { count: setCount } = parseSetsArg(args.setsArg);
  const sets = resolveSets(spec, config, setCount);
  const setIds = sets.map(s => s.id);
  const isMatrix = sets.length > 1;

  const cache = new BackgroundCache(args.projectRoot, args.regenIds);
  const manifestItems: ManifestItem[] = [];
  // One-shot in-memory cache: a (theme × orientation) renders ONCE per run.
  const bgBucket = new Map<string, Buffer>();
  // App-aware AI prompt context, derived from spec.aso + config.app.category.
  const appContext = buildAppContext(spec, config);

  console.log(`\n▶  store-assets  v${spec.version}`);
  console.log(`   Sets:      ${setIds.join(', ')}`);
  console.log(`   Platforms: ${activePlatforms.join(', ')}`);
  console.log(`   Locales:   ${locales.join(', ')}`);
  console.log(`   Backgrounds: ${args.useAiBg ? `AI (${provider} ${model})` : 'CSS/SVG'}${args.dryRun ? '  [DRY-RUN]' : ''}`);
  console.log(`   Output:    ${outDir}\n`);

  // ── Listing markdown ────────────────────────────────────────────────────────
  if (!args.imagesOnly) {
    const { warnings, written } = writeStoreListings(spec, config.app.name, outDir, locales, setIds);
    for (const w of written) console.log(`  ✓  ${path.relative(args.projectRoot, w)}`);
    for (const w of warnings) {
      console.log(`  ⚠️  ${w.locale}/${w.store}.${w.field}: ${w.length}/${w.limit} chars (over limit)`);
    }
  }

  // ── Images ──────────────────────────────────────────────────────────────────
  if (!args.textOnly) {
    for (const set of sets) {
      console.log(`\n══ set ${set.id}  (theme: ${set.theme.id} · ${set.theme.bg_style} · frame: ${set.theme.frame})`);

      for (const ss of spec.screenshots) {
        const resolved = resolveScreenshot(ss, set);
        console.log(`\n── ${ss.id}  [${resolved.layout}]`);

        for (const platform of activePlatforms) {
          const platformCfg = PLATFORMS[platform];
          const { outputDir: outSubDir } = platformCfg;

          const screenshotPath = resolveScreenshotPath(ssDir, ss, platform, resolved.layout);

          // Resolve orientation: explicit spec value wins; otherwise auto-detect
          // from the screenshot's natural aspect (w > h ⇒ landscape).
          let orientation = ss.orientation;
          if (!orientation && screenshotPath) {
            const aspect = await screenshotAspect(screenshotPath);
            orientation = aspect < 1 ? 'landscape' : 'portrait';
          }
          orientation ??= 'portrait';

          // Swap canvas dimensions for landscape. Wear OS is square so it stays
          // unchanged regardless of orientation; TV banner is already landscape.
          const isSquareOrAlreadyLandscape =
            platform === 'wear-os' || platform === 'android-tv-banner' || platformCfg.aspectRatio === '16:9';
          const W = orientation === 'landscape' && !isSquareOrAlreadyLandscape
            ? platformCfg.height : platformCfg.width;
          const H = orientation === 'landscape' && !isSquareOrAlreadyLandscape
            ? platformCfg.width : platformCfg.height;
          const aspectRatio = orientation === 'landscape' ? '16:9' : platformCfg.aspectRatio;

          // If the resolved layout is portrait but orientation is landscape
          // (or vice versa), swap to a slot-appropriate landscape layout.
          const landscapeLayouts = new Set([
            'landscape-split', 'landscape-hero', 'landscape-text-only',
          ]);
          let effectiveLayout = resolved.layout;
          if (orientation === 'landscape' && !landscapeLayouts.has(effectiveLayout)) {
            const slot = ss.slot ?? 'value';
            effectiveLayout = layoutForSet(slot, sets.indexOf(set), 'landscape');
          } else if (orientation === 'portrait' && landscapeLayouts.has(effectiveLayout)) {
            const slot = ss.slot ?? 'value';
            effectiveLayout = layoutForSet(slot, sets.indexOf(set), 'portrait');
          }
          resolved.layout = effectiveLayout;
          // Special-purpose platforms (Wear OS, TV banner) compose from icon +
          // text only — they never need a screenshot source regardless of what
          // the spec's `layout` says.
          const platformNeedsSource = platform !== 'wear-os' && platform !== 'android-tv-banner';
          // Otherwise: skip only if the layout actually needs a phone but no
          // source was found. text-hero and unknown layouts fall through (the
          // dispatcher's default is text-hero, which works without a source).
          if (platformNeedsSource && requiresScreenshot(resolved.layout) && !screenshotPath) {
            console.log(`  ⚠️  ${platform}: no source screenshot — skipping`);
            continue;
          }
          // For dual-phone-overlap, prefer an explicit secondary source. If
          // none provided, auto-pair with a sibling screenshot's source so the
          // two phones show different content (the user flagged that two
          // copies of the same shot doesn't read as variety).
          let screenshotPathSecondary: string | null = ss.sources_secondary?.[platform]
            ? path.join(ssDir, platform, ss.sources_secondary[platform]!)
            : null;
          if (!screenshotPathSecondary && resolved.layout === 'dual-phone-overlap') {
            const siblings = spec.screenshots.filter(s => s.id !== ss.id && s.sources?.[platform]);
            const sibling = siblings[0];
            if (sibling) {
              const sp = path.join(ssDir, platform, sibling.sources![platform]!);
              if (fs.existsSync(sp)) screenshotPathSecondary = sp;
            }
          }

          console.log(`  ${platform} (${W}×${H})...`);

          const bgRaw = await acquireBackground({
            args, cache, set, theme: set.theme,
            orientation: orientation === 'landscape' ? 'landscape' : orientationFor(aspectRatio),
            provider, model, apiKey, quality,
            appContext, bucket: bgBucket,
          });

          // One render per locale within this (set, screenshot, platform).
          for (const locale of locales) {
            const localeOverride =
              locale === DEFAULT_LOCALE ? null : ss.locales?.[locale] ?? null;
            const headline    = localeOverride?.headline    ?? resolved.headline;
            const subheadline = localeOverride?.subheadline ?? resolved.subheadline;

            const layoutInput: LayoutInput = {
              background: bgRaw,
              screenshotPath,
              screenshotPathSecondary,
              screenshot: {
                id: ss.id,
                layout: resolved.layout,
                headline,
                subheadline,
                callout: resolved.callout,
                features: resolved.features,
                badge_count: resolved.badge_count,
                badge_label: resolved.badge_label,
              },
              theme: set.theme,
              config,
              targetWidth: W,
              targetHeight: H,
              projectRoot: args.projectRoot,
            };

            const rendered = await renderLayout(layoutInput, platform);

            const segments = [
              locale === DEFAULT_LOCALE ? '' : locale,
              isMatrix ? `set-${set.id}` : '',
            ].filter(Boolean);
            const outPath = path.join(outDir, ...segments, outSubDir, `${ss.id}.png`);

            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            await sharp(rendered).png().toFile(outPath);
            console.log(`  ✓  ${path.relative(args.projectRoot, outPath)}`);

            // Record for manifest. Path is relative to the release folder (one
            // level up from outDir), which is where review.html lives.
            const releaseDirAbs = path.dirname(outDir);
            const platformLabel = manifestPlatformLabel(platform);
            const keyParts = [
              locale === DEFAULT_LOCALE ? null : locale,
              set.id,
              ss.id,
              platformLabel,
            ].filter(Boolean) as string[];
            manifestItems.push({
              key: keyParts.join('/'),
              set: set.id,
              theme: `${set.theme.id} · ${set.theme.bg_style} · ${set.theme.frame}`,
              screenshot: ss.id,
              platform: platformLabel,
              layout: resolved.layout,
              slot: ss.slot ?? 'value',
              src: path.relative(releaseDirAbs, outPath),
              width: W,
              height: H,
              orientation,
            });
          }
        }
      }

      // Feature graphic per (set, locale) for Google Play
      if (activePlatforms.some(p => p.startsWith('android'))) {
        console.log('\n── feature-graphic');
        for (const locale of locales) {
          const segments = [
            locale === DEFAULT_LOCALE ? '' : locale,
            isMatrix ? `set-${set.id}` : '',
          ].filter(Boolean);
          const localeOutDir = path.join(outDir, ...segments);
          await buildFeatureGraphic(
            args, cache, provider, model, apiKey, spec, config, localeOutDir, quality,
            set.theme, set, bgBucket, appContext,
          );

          // Record feature graphic in the manifest
          const releaseDirAbs = path.dirname(outDir);
          const fgPath = path.join(localeOutDir, 'google-play', 'feature-graphic.png');
          const keyParts = [
            locale === DEFAULT_LOCALE ? null : locale,
            set.id,
            'feature-graphic',
          ].filter(Boolean) as string[];
          manifestItems.push({
            key: keyParts.join('/'),
            set: set.id,
            theme: `${set.theme.id} · ${set.theme.bg_style} · ${set.theme.frame}`,
            screenshot: 'feature-graphic',
            platform: 'google-play',
            layout: 'feature-graphic',
            slot: 'feature',
            src: path.relative(releaseDirAbs, fgPath),
            width: FEATURE_GRAPHIC.width,
            height: FEATURE_GRAPHIC.height,
            orientation: 'landscape',
          });
        }
      }
    }
  }

  // ── Review page (manifest.json + review.html) ──────────────────────────────
  // Always written, even with --text-only, --images-only, or --dry-run, so the
  // user can review whatever was just produced.
  if (manifestItems.length > 0) {
    const releaseDir = path.dirname(outDir);
    const { manifestPath, htmlPath } = writeReviewFiles({
      version: spec.version,
      releaseDir,
      items: manifestItems,
    });
    console.log(`\n  ✓  ${path.relative(args.projectRoot, manifestPath)}`);
    if (htmlPath) console.log(`  ✓  ${path.relative(args.projectRoot, htmlPath)}  ← open this in your browser to review`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const { hits, misses } = cache.stats();
  console.log('\n✅  Done');
  if (args.useAiBg && (hits || misses)) {
    console.log(`   AI cache: ${hits} hits, ${misses} misses`);
  }
  if (isMatrix) {
    console.log(`\n  Each set is in its own subfolder: set-${setIds.join('/, set-')}/`);
    console.log('  Pick the strongest sets to ship to PPO / Google Play experiments.');
  }
  console.log('');
}

main().catch(err => {
  console.error('\n✖  Error:', err.message ?? err);
  process.exit(1);
});

void __dirname;
