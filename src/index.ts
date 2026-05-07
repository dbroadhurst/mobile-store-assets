import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import sharp from 'sharp';

import type { Spec, StoreConfig, Platform, LayoutInput } from './types.js';
import { PLATFORMS, FEATURE_GRAPHIC } from './config.js';
import { generateBackground, generateFeatureGraphicBg, type Provider } from './gemini.js';
import { resizeBg, escapeXml, fitText } from './helpers.js';
import { heroCenter } from './layouts/hero.js';
import { split } from './layouts/split.js';
import { featureCallout } from './layouts/callout.js';
import { cta } from './layouts/cta.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI: --version, --spec, --config, --screenshots, --output, --platform, --images-only, --text-only
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
  const has = (flag: string) => args.includes(flag);

  const projectRoot  = get('--root')        ?? process.cwd();
  const version      = get('--version')     ?? detectLatestVersion(projectRoot);
  const specPath     = get('--spec')        ?? `marketing/releases/${version}/spec.yaml`;
  const configPath   = get('--config')      ?? 'marketing/.store-config.yaml';
  const screenshotsDir = get('--screenshots') ?? `marketing/releases/${version}/screenshots`;
  const outputDir    = get('--output')      ?? `marketing/releases/${version}/output`;
  const platforms    = (get('--platform') ?? 'all').split(',') as (Platform | 'all')[];
  const imagesOnly   = has('--images-only');
  const textOnly     = has('--text-only');

  return { version, projectRoot, specPath, configPath, screenshotsDir, outputDir, platforms, imagesOnly, textOnly };
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

// Returns the first API key found in the env file (by line order), not by type priority.
function parseFirstProvider(envPath: string): { provider: Provider; apiKey: string } | null {
  let raw: string;
  try { raw = fs.readFileSync(envPath, 'utf8'); } catch { return null; }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '').trim();
    if (!v) continue;
    if (k === 'OPENAI_API_KEY')    return { provider: 'openai',  apiKey: v };
    if (k === 'GOOGLE_AI_API_KEY') return { provider: 'google',  apiKey: v };
  }
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Layout dispatcher ────────────────────────────────────────────────────────

async function renderLayout(input: LayoutInput, projectRoot: string): Promise<Buffer> {
  switch (input.spec.layout) {
    case 'split-right':     return split(input, 'right');
    case 'split-left':      return split(input, 'left');
    case 'feature-callout': return featureCallout(input);
    case 'cta':             return cta(input, projectRoot);
    default:                return heroCenter(input);
  }
}

// ─── Feature graphic (Google Play 1024×500) ───────────────────────────────────

async function buildFeatureGraphic(
  provider: Provider,
  model: string,
  apiKey: string,
  spec: Spec,
  config: StoreConfig,
  outputDir: string,
): Promise<void> {
  const { width, height } = FEATURE_GRAPHIC;
  console.log('  Generating feature graphic background...');

  const prompt = `${spec.style.theme_prompt ?? config.brand.theme_motif}. ` +
    `Professional Google Play feature graphic. Wide landscape banner. ` +
    `Gradient from deep teal to bright aqua. No text. No numbers. No letters.`;

  const bgRaw = await generateFeatureGraphicBg(provider, model, apiKey, prompt);
  const bg    = await resizeBg(bgRaw, width, height);

  const appName = config.app.name;
  const tagline = spec.app_store.promotional_text ?? spec.app_store.subtitle ?? '';

  const safe     = width * 0.86;
  const nameSz   = fitText(appName, safe * 0.55, Math.floor(height * 0.28), 0.60);
  const tagSz    = fitText(tagline, safe * 0.55, Math.floor(height * 0.14), 0.54);
  const nameY    = Math.floor(height * 0.42);
  const taglineY = Math.floor(height * 0.70);

  const overlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.70)"/>
      <stop offset="55%"  stop-color="rgba(0,0,0,0.35)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.05)"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <text x="72" y="${nameY}" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${nameSz}" font-weight="700"
    fill="#FFFFFF">${escapeXml(appName)}</text>
  <text x="72" y="${taglineY}" dominant-baseline="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${tagSz}" font-weight="400"
    fill="rgba(255,255,255,0.88)">${escapeXml(tagline)}</text>
</svg>`;

  const outPath = path.join(outputDir, 'google-play', 'feature-graphic.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  await sharp(bg)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toFile(outPath);

  console.log(`  ✓  feature-graphic.png (${width}×${height})`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // Load .env.local from marketing/ (one level up from releases/)
  const envPath = path.join(args.projectRoot, 'marketing', '.env.local');
  dotenv.config({ path: envPath });

  const detected = parseFirstProvider(envPath);
  if (!detected) {
    console.error('✖  Set OPENAI_API_KEY or GOOGLE_AI_API_KEY in marketing/.env.local');
    process.exit(1);
  }
  const { provider, apiKey } = detected;

  const spec: Spec     = loadYaml(path.join(args.projectRoot, args.specPath));
  const config: StoreConfig = loadYaml(path.join(args.projectRoot, args.configPath));
  const model = provider === 'openai'
    ? (config.openai?.model ?? 'gpt-image-1')
    : (config.imagen?.model ?? 'imagen-4.0-fast-generate-001');
  const ssDir = path.join(args.projectRoot, args.screenshotsDir);
  const outDir = path.join(args.projectRoot, args.outputDir);

  const activePlatforms = (Object.keys(PLATFORMS) as Platform[]).filter(p =>
    args.platforms.includes('all') || args.platforms.includes(p)
  );

  console.log(`\n▶  store-assets  v${spec.version}`);
  console.log(`   Provider:  ${provider} (${model})`);
  console.log(`   Platforms: ${activePlatforms.join(', ')}`);
  console.log(`   Screenshots: ${ssDir}`);
  console.log(`   Output: ${outDir}\n`);

  // ── Images ──────────────────────────────────────────────────────────────────
  if (!args.textOnly) {
    for (const ss of spec.screenshots) {
      console.log(`\n── ${ss.id}  [${ss.layout}]`);

      for (const platform of activePlatforms) {
        const platformCfg = PLATFORMS[platform];
        const { width: W, height: H, aspectRatio, outputDir: outSubDir } = platformCfg;

        // Resolve screenshot source
        const sourceFile = ss.sources?.[platform];
        const screenshotPath = (ss.layout !== 'cta' && sourceFile)
          ? path.join(ssDir, platform, sourceFile)
          : null;

        if (ss.layout !== 'cta' && !screenshotPath) {
          console.log(`  ⚠️  ${platform}: no source screenshot — skipping`);
          continue;
        }
        if (screenshotPath && !fs.existsSync(screenshotPath)) {
          console.log(`  ⚠️  ${platform}: file not found ${screenshotPath} — skipping`);
          continue;
        }

        console.log(`  ${platform} (${W}×${H})...`);

        const prompt = [ss.imagen_prompt, spec.style?.theme_prompt ?? config.brand.theme_motif]
          .filter(Boolean).join('. ');

        const bgRaw = await generateBackground(provider, model, apiKey, prompt, aspectRatio);

        const layoutInput: LayoutInput = {
          background: bgRaw,
          screenshotPath,
          spec: ss,
          style: spec.style,
          config,
          targetWidth: W,
          targetHeight: H,
        };

        const rendered = await renderLayout(layoutInput, args.projectRoot);

        const outPath = path.join(outDir, outSubDir, `${ss.id}.png`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        await sharp(rendered).png().toFile(outPath);
        console.log(`  ✓  ${path.relative(args.projectRoot, outPath)}`);

        await sleep(1200); // stay within Imagen rate limits
      }
    }

    // Feature graphic (Google Play only, landscape Imagen call)
    if (activePlatforms.some(p => p.startsWith('android'))) {
      console.log('\n── feature-graphic');
      await buildFeatureGraphic(provider, model, apiKey, spec, config, outDir);
    }
  }

  console.log('\n✅  Done\n');
  console.log('  google-play/phone/         → Google Play Console → Phone screenshots');
  console.log('  google-play/tablet/        → Google Play Console → Tablet 10" screenshots');
  console.log('  google-play/feature-graphic.png → Feature Graphic slot');
  console.log('  app-store/iphone-6.9/      → App Store Connect → 6.9" iPhone');
  console.log('  app-store/ipad-pro-12.9/   → App Store Connect → iPad Pro 12.9"');
  console.log('\n  store-listing.md files written by Claude — check output/ folder.\n');
}

main().catch(err => {
  console.error('\n✖  Error:', err.message ?? err);
  process.exit(1);
});
