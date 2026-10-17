import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import sharp from 'sharp';

import type {
  Spec,
  StoreConfig,
  Platform,
  LayoutInput,
  LayoutResult,
  ScreenshotSpec,
  ProviderId,
  SetSpec,
  Theme,
} from './types.js';
import { requiresScreenshot } from './types.js';
import { validateZones } from './contrast-gate.js';
import { PLATFORMS, FEATURE_GRAPHIC, DEFAULT_LOCALE } from './config.js';
import {
  generateBackground,
  generateFeatureGraphicBg,
  sizeKey,
  type Provider,
  type OpenAIQuality,
} from './gemini.js';
import { stripBrackets, screenshotAspect } from './helpers.js';
import { layoutForSet } from './story-arc.js';
import { BackgroundCache } from './cache.js';
import { writeStoreListings } from './listing.js';
import { extractTheme } from './colors.js';
import { renderBackground } from './backgrounds.js';
import { resolveSets, resolveScreenshot, parseSetsArg } from './matrix.js';
import { writeReviewFiles, type ManifestItem } from './review.js';
// Every layout is a JSX template rendered with Playwright. See
// `src/layouts/` for the canonical set; `design/index.html` is the WYSIWYG
// atlas of what each one produces.
import { captionBand } from './layouts/caption-band.js';
import { heroType } from './layouts/hero-type.js';
import { headlineMasthead } from './layouts/headline-masthead.js';
import { featureStack } from './layouts/feature-stack.js';
import { editorialCard } from './layouts/editorial-card.js';
import { tiltedCard } from './layouts/tilted-card.js';
import { verticalBento } from './layouts/vertical-bento.js';
import { dualPhone } from './layouts/dual-phone.js';
import { landscapeSplit } from './layouts/landscape-split.js';
import { landscapeHero } from './layouts/landscape-hero.js';
import { landscapeTextOnly } from './layouts/landscape-text-only.js';
import { wearOs } from './layouts/wear-os.js';
import { tvBanner } from './layouts/tv-banner.js';
import { featureGraphic, FEATURE_GRAPHIC_VARIANTS } from './layouts/feature-graphic.js';
import { shutdownBrowser } from './render/browser.js';

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
  envPaths: string[],
  override?: ProviderId,
  fromConfig?: ProviderId,
): { provider: Provider; apiKey: string } | null {
  // Earlier files win: a project's own key overrides the per-user one.
  const keys: Record<ProviderId, string | null> = { openai: null, google: null };
  for (const envPath of [...envPaths].reverse()) {
    let raw: string;
    try { raw = fs.readFileSync(envPath, 'utf8'); } catch { continue; }
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

// Legacy layout-name alias map. Older spec.yaml files reference superseded names
// (text-hero, caption-below, etc.); we transparently route them to their
// container-first replacements so existing projects pick up the new visuals
// without spec-yaml edits. Mapping picks the closest semantic match per the
// design atlas in SKILL.md §11.
const LEGACY_LAYOUT_ALIASES: Record<string, import('./types.js').Layout> = {
  'text-hero':          'hero-type',
  'caption-below':      'caption-band',
  'uppercase-top':      'headline-masthead',
  'logo-tilted':        'hero-type',
  'aurora-hero':        'hero-type',
  'bento':              'vertical-bento',
  'editorial-split':    'editorial-card',
  'highlight-pill':     'hero-type',
  'side-list':          'feature-stack',
  'card-tilted':        'tilted-card',
  'dual-phone-overlap': 'dual-phone',
};

function canonicalLayout(name: string): import('./types.js').Layout {
  return (LEGACY_LAYOUT_ALIASES[name] ?? name) as import('./types.js').Layout;
}

async function renderLayout(input: LayoutInput, platform: Platform): Promise<LayoutResult> {
  // Special-purpose surfaces ignore the spec's `layout` field — Wear OS and
  // the TV banner have fixed compositions because phone-screenshot layouts
  // don't make sense at 1:1 watch size or 16:9 banner.
  if (platform === 'wear-os')           return wearOs(input);
  if (platform === 'android-tv-banner') return tvBanner(input);

  switch (canonicalLayout(input.screenshot.layout)) {
    // Portrait
    case 'hero-type':           return heroType(input);
    case 'caption-band':        return captionBand(input);
    case 'headline-masthead':   return headlineMasthead(input);
    case 'editorial-card':      return editorialCard(input);
    case 'vertical-bento':      return verticalBento(input);
    case 'feature-stack':       return featureStack(input);
    case 'dual-phone':          return dualPhone(input);
    case 'tilted-card':         return tiltedCard(input);
    // Landscape
    case 'landscape-split':     return landscapeSplit(input);
    case 'landscape-hero':      return landscapeHero(input);
    case 'landscape-text-only': return landscapeTextOnly(input);
    default:                    return heroType(input);
  }
}

// ─── Auto-remediation retry loop ────────────────────────────────
// After the first render, the gate samples actual pixels under each declared
// zone. On any failure, we bump the contrast target one notch and re-render
// up to MAX_RETRIES times. Layouts that declare no zones (`zones: []`) so the
// gate trivially passes and the retry loop never engages for them.
const MAX_GATE_RETRIES = 2;

async function renderLayoutWithRetry(
  input: LayoutInput,
  platform: Platform,
  canvasWidth: number,
  canvasHeight: number,
): Promise<{ result: LayoutResult; gate: import('./types.js').GateResult; attempts: number }> {
  let lastResult: LayoutResult = await renderLayout(input, platform);
  let lastGate = lastResult.zones.length > 0
    ? await validateZones(lastResult.buffer, lastResult.zones, canvasWidth, canvasHeight)
    : { contrast: [], fontSize: [] };
  if (lastResult.zones.length === 0) {
    return { result: lastResult, gate: lastGate, attempts: 1 };
  }
  for (let attempt = 1; attempt <= MAX_GATE_RETRIES; attempt++) {
    if (lastGate.contrast.length === 0) break;
    // Bump the panel scrim on each retry. scrimBoost rides through to the
    // `--scrim-boost` CSS var (see src/render/html-shell.tsx); layouts add
    // it directly to their panel `rgba(...)` alphas. Scale 0.15, 0.30 — caps
    // before fully obliterating the bg pixels (base panel alphas are 0.55–
    // 0.78, so final stops around 0.93–1.08).
    //
    // NOTE on calibration: validateZones samples pixels inside the text bbox,
    // which includes the rendered glyph pixels themselves. For white text
    // this biases the measured "bg" luminance toward white, under-reporting
    // contrast. The boost still increases real contrast monotonically; the
    // measurement is conservative. Future improvement: sample a frame around
    // the glyphs instead of through them.
    const boostedInput: LayoutInput = { ...input, scrimBoost: attempt * 0.15 };
    lastResult = await renderLayout(boostedInput, platform);
    lastGate = await validateZones(lastResult.buffer, lastResult.zones, canvasWidth, canvasHeight);
  }
  return { result: lastResult, gate: lastGate, attempts: 1 + MAX_GATE_RETRIES };
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

// Composition rule that must apply to every background. The layouts in this
// system put phone mockups and centred text panels in the middle of the
// canvas, so motifs concentrated there get covered. Motifs *at the edges*
// remain visible alongside the overlays.
//
// Distribute subjects to the canvas perimeter (top band, bottom band, left
// edge, right edge, corners) and keep the centre soft so phone/text overlays
// sit on it cleanly.
const TEXT_SAFE_DIRECTIVE =
  'Distribute subject motifs around the edges of the canvas — the top band, ' +
  'bottom band, left edge, right edge, and corners — so they remain visible ' +
  'when phone mockups and centred text panels overlay the middle. Keep the ' +
  'centre 40% soft, low-contrast and uncluttered. Subjects should be abstract ' +
  'and stylised, not literal illustrations.';

function graphicStylePrompt(theme: Theme, app: AppContext): string {
  // Builds a structured prompt for AI background generation. The plugin does
  // NOT enumerate app types or inject subject motifs of its own — all subject
  // context comes from user-authored fields (hint, positioning, keywords,
  // category). The model picks suitable motifs from that input.
  //
  //   1. Style + palette  — the visual language (gradient / mesh / bokeh / …)
  //   2. User subject     — hint + positioning + keywords + category, verbatim
  //   3. Treatment        — generic "abstract, stylised, watermark" framing
  //   4. Text-safe        — keep top/bottom open, centre interest
  // Palette is referenced by NAME — never hex (Imagen renders hex as text).
  const palette = theme.palette_name;
  const styleSeed = (() => {
    switch (theme.bg_style) {
      case 'gradient':
        return `Soft abstract gradient wash in ${palette}, smooth flat color field, minimal modern composition.`;
      case 'mesh':
        return `Abstract mesh-gradient composition with smooth color blends in ${palette}, flowing organic forms, modern flat design.`;
      case 'bokeh':
        return `Abstract bokeh-style illustration with soft blurred color blobs in ${palette}, dreamy minimal vector look.`;
      case 'geometric':
        return `Minimalist geometric abstract composition, simple overlapping shapes in ${palette}, flat vector design, modern aesthetic.`;
      case 'minimal':
        return `Minimal flat color field in ${palette} with subtle radial vignette, clean modern design.`;
      case 'app-motif':
        return `Minimal abstract composition in ${palette}, faint line-art vector silhouettes scattered as a watermark, soft modern illustration.`;
    }
  })();

  // User-authored subject context. We pass these fields VERBATIM and let the
  // model pick subject motifs from them. No regex inference, no category-
  // specific imagery — the plugin has no opinion about what your app does.
  const ctxBits: string[] = [];
  if (app.category)    ctxBits.push(`category: ${app.category}`);
  if (app.positioning) ctxBits.push(`positioning: ${truncate(app.positioning, 200)}`);
  if (app.keywords.length) ctxBits.push(`keywords: ${app.keywords.slice(0, 8).join(', ')}`);
  if (app.hint)        ctxBits.push(`app context: ${truncate(app.hint, 200)}`);
  const userContext = ctxBits.length ? ctxBits.join('. ') + '.' : '';

  const treatment = userContext
    ? 'Pick subject motifs that fit the app context above. Render them as faint, semi-transparent abstract silhouettes — stylised and watermark-like, not literal illustrations.'
    : '';

  return [styleSeed, userContext, treatment, TEXT_SAFE_DIRECTIVE].filter(Boolean).join(' ');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

// User-authored steering bundle — what the user wrote about their app. The
// plugin passes these through verbatim to AI prompts and stores them for
// downstream renderers. The plugin does NOT enumerate app types, infer motif
// categories from keywords, or inject any subject imagery of its own.
interface AppContext {
  hint: string;
  category: string;
  positioning: string;
  keywords: string[];
}

function buildAppContext(spec: Spec, config: StoreConfig): AppContext {
  return {
    category:    (config.app.category ?? '').trim(),
    positioning: (spec.aso?.positioning ?? '').trim(),
    keywords: [
      ...(spec.aso?.primary_keywords ?? []),
      ...(spec.aso?.secondary_keywords ?? []),
    ].map(k => k.trim()).filter(Boolean),
    hint:        (spec.hint ?? '').trim(),
  };
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
    const buf = await renderBackground(b.theme, dims.w, dims.h);
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
  // Guarantee the bg is opaque RGB before it reaches the compositor — some AI
  // providers return PNGs with an alpha channel (even fully-opaque ones), and
  // a 4-channel base contaminates the rest of the pipeline. Backstop blends
  // with the theme so any actual transparency at the edges reads as bg.
  buf = await sharp(buf).flatten({ background: b.theme.bg_from }).png().toBuffer();
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
  setIndex: number,
): Promise<void> {
  const { width, height } = FEATURE_GRAPHIC;
  console.log('  Generating feature graphic...');

  // Reuse the landscape background generated for this theme.
  const bg = await acquireBackground({
    args, cache, set, theme,
    orientation: 'landscape',
    provider, model, apiKey, quality,
    appContext, bucket,
  });

  // ── Best-practice rules baked into the layout ──────────────────────────────
  // • Benefit-led headline (5–8 words) from screenshots[0] — never the app
  //   name (Play shows it adjacent and flags duplication).
  // • Multiple phones (up to 3) telling the app's story at a glance.
  // • One of 3 rotating variants per set (banner-bottom / hero-right /
  //   cluster-left) so the matrix offers visual variety, not 4 copies.
  // • Adaptive panel scrim — dark when headline is light, light when dark —
  //   so text reads against any AI background.
  // • Phones supersampled (2×) + lanczos3 downsize for crisp small frames.
  // • Slight edge bleed allowed (phones can clip the safe zone by ~30 px)
  //   for energy.
  // • 24-bit PNG output (flatten + removeAlpha post-step).
  // Sources: Apptamin, Gummicube, ScreenshotWhale ASO guides (2026).
  const SAFE = 60;

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

  // Resolve up to 3 phone sources from the first 3 screenshots in the spec.
  const ssDir = path.join(args.projectRoot, args.screenshotsDir);
  const sourcePicks: Array<{ platform: string; folder: string }> = [
    { platform: 'android-phone',  folder: 'android-phone'  },
    { platform: 'ios-phone',      folder: 'ios-phone'      },
    { platform: 'android-tablet', folder: 'android-tablet' },
    { platform: 'ios-tablet',     folder: 'ios-tablet'     },
  ];
  function resolvePhonePath(ss: typeof valueSs): string | null {
    if (!ss) return null;
    for (const pick of sourcePicks) {
      const file = ss.sources?.[pick.platform as Platform];
      if (!file) continue;
      const abs = path.join(ssDir, pick.folder, file);
      if (fs.existsSync(abs)) return abs;
    }
    return null;
  }
  const phonePaths = spec.screenshots
    .slice(0, 3)
    .map(resolvePhonePath)
    .filter((p): p is string => p !== null);

  // ── Variant dispatch ──────────────────────────────────────────────────────
  // 3 variants rotated by setIndex so the matrix has visual variety. The
  // adaptive scrim (dark-on-light-text or light-on-dark-text) lives inside the
  // layout itself; see src/layouts/feature-graphic.tsx.
  const variant = FEATURE_GRAPHIC_VARIANTS[setIndex % FEATURE_GRAPHIC_VARIANTS.length];

  const { buffer: rendered } = await featureGraphic({
    background: bg,
    phonePaths,
    headline,
    subline,
    theme,
    variant,
    width,
    height,
  });

  const outPath = path.join(outputDir, 'google-play', 'feature-graphic.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Output as 24-bit PNG (no alpha) — Play rejects transparency on this asset.
  // flatten() blends any partially-transparent pixels into the theme bg;
  // removeAlpha() strips the channel byte so the encoded PNG is genuinely
  // 24-bit (sharp's .png() can otherwise emit 32-bit with all-opaque alpha,
  // which Play's stricter validator flags as "has alpha").
  await sharp(rendered)
    .flatten({ background: theme.bg_from })
    .removeAlpha()
    .png()
    .toFile(outPath);
  console.log(`  ✓  feature-graphic.png (${width}×${height})`);
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

  // marketing/.env.local first, then a per-user file shared by all projects.
  const envPaths = [
    path.join(args.projectRoot, 'marketing', '.env.local'),
    path.join(os.homedir(), '.config', 'mobile-store-assets', '.env'),
  ];
  dotenv.config({ path: envPaths });

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
    const detected = pickProvider(envPaths, args.providerOverride, config.default_provider);
    if (args.useAiBgFlag && !detected) {
      console.error('✖  --use-ai-bg requires OPENAI_API_KEY or GOOGLE_AI_API_KEY in marketing/.env.local or ~/.config/mobile-store-assets/.env');
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

          // Measure the source screenshot's natural h/w aspect. Used for both
          // orientation auto-detection (below) AND passed into the layout so
          // its phone/tablet slot matches the source — phone shots get a
          // phone-shaped slot, tablet shots get a tablet-shaped slot.
          const screenshotAspectRatio = screenshotPath
            ? await screenshotAspect(screenshotPath)
            : undefined;

          // Resolve orientation: explicit spec value wins; otherwise auto-detect
          // from the screenshot's natural aspect (w > h ⇒ landscape).
          let orientation = ss.orientation;
          if (!orientation && screenshotAspectRatio !== undefined) {
            orientation = screenshotAspectRatio < 1 ? 'landscape' : 'portrait';
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
          // For dual-phone, prefer an explicit secondary source. If none
          // provided, auto-pair with a sibling screenshot's source so the
          // two phones show different content (two copies of the same shot
          // doesn't read as variety).
          let screenshotPathSecondary: string | null = ss.sources_secondary?.[platform]
            ? path.join(ssDir, platform, ss.sources_secondary[platform]!)
            : null;
          if (!screenshotPathSecondary && (resolved.layout === 'dual-phone' || (resolved.layout as string) === 'dual-phone-overlap')) {
            const siblings = spec.screenshots.filter(s => s.id !== ss.id && s.sources?.[platform]);
            const sibling = siblings[0];
            if (sibling) {
              const sp = path.join(ssDir, platform, sibling.sources![platform]!);
              if (fs.existsSync(sp)) screenshotPathSecondary = sp;
            }
          }
          const screenshotAspectRatioSecondary = screenshotPathSecondary
            ? await screenshotAspect(screenshotPathSecondary)
            : undefined;

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
              screenshotAspectRatio,
              screenshotAspectRatioSecondary,
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

            // Readability gate with auto-remediation: render → sample
            // pixels under each declared zone → on contrast failure bump the
            // target ratio and re-render (up to 2 retries). Layouts
            // declare no zones and skip the retry loop entirely.
            const { result: rendered, gate: gateResult, attempts } =
              await renderLayoutWithRetry(layoutInput, platform, W, H);
            const gateBadCount = gateResult.contrast.length + gateResult.fontSize.length;
            if (attempts > 1) {
              console.log(`  ↻  ${ss.id}/${platform}: retried ${attempts - 1}× for readability`);
            }
            if (gateBadCount > 0) {
              console.log(`  ⚠️  ${gateBadCount} readability issue${gateBadCount > 1 ? 's' : ''} on ${ss.id}/${platform} (after ${attempts} attempt${attempts > 1 ? 's' : ''})`);
              for (const v of gateResult.contrast) {
                console.log(`     · contrast ${v.measured}:1 < ${v.target}:1 (${v.role}: "${v.text.slice(0, 60)}")`);
              }
              for (const v of gateResult.fontSize) {
                console.log(`     · font ${v.fontSize}px < ${v.minimum}px floor (${v.role})`);
              }
            }

            const segments = [
              locale === DEFAULT_LOCALE ? '' : locale,
              isMatrix ? `set-${set.id}` : '',
            ].filter(Boolean);
            const outPath = path.join(outDir, ...segments, outSubDir, `${ss.id}.png`);

            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            // Strip alpha before write — Play and App Store reject store
            // assets with transparency. flatten() blends thin alpha edges
            // with the theme bg; removeAlpha() then drops the channel byte
            // so the encoded PNG is genuinely 24-bit (some tools still flag
            // 32-bit-with-all-opaque-alpha PNGs as "has alpha").
            await sharp(rendered.buffer)
              .flatten({ background: set.theme.bg_from })
              .removeAlpha()
              .png()
              .toFile(outPath);
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
              gates: gateResult,
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
            set.theme, set, bgBucket, appContext, sets.indexOf(set),
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

main()
  .catch(err => {
    console.error('\n✖  Error:', err.message ?? err);
    process.exit(1);
  })
  .finally(() => {
    // Close the Playwright browser. Without this the Node process hangs on
    // the open browser handle. No-op when the browser was never launched.
    return shutdownBrowser().catch(() => {});
  });

void __dirname;
