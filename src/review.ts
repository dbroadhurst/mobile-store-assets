import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Manifest item ────────────────────────────────────────────────────────────
// One entry per rendered image (screenshot OR feature graphic). The review page
// loads this manifest and renders one card per item.

export interface ManifestItem {
  key: string;          // unique id, e.g. "A/home/iphone-6.9"
  set: string;          // "A", "B", "C", "D", ...
  theme: string;        // human-readable theme summary
  screenshot: string;   // screenshot id, e.g. "home" — or "feature-graphic"
  platform: string;     // "iphone-6.9", "ipad-pro-12.9", "android-phone", "android-tablet", "google-play"
  layout: string;       // resolved layout name, e.g. "uppercase-top"
  slot: string;         // story-arc slot
  src: string;          // path relative to the directory holding manifest.json
  width: number;        // rendered canvas width (drives review.html aspect-ratio)
  height: number;       // rendered canvas height
  orientation: 'portrait' | 'landscape';
}

interface ReviewWriterOptions {
  version: string;
  releaseDir: string;        // absolute path; manifest.json + review.html go here
  items: ManifestItem[];
}

// Path to the bundled review.html template, relative to this compiled file.
function templatePath(): string {
  // src/ at dev time, dist/ at compile time — both sit under the plugin root
  // and templates/ is at the plugin root.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'templates', 'review.html');
}

/**
 * Write `manifest.json` and `review.html` into the release folder. The page
 * loads the manifest via fetch and renders a vote/comment card per image.
 *
 * Returns absolute paths of both written files for logging.
 */
export function writeReviewFiles(opts: ReviewWriterOptions): { manifestPath: string; htmlPath: string } {
  const { version, releaseDir, items } = opts;
  fs.mkdirSync(releaseDir, { recursive: true });

  // manifest.json
  const manifestPath = path.join(releaseDir, 'manifest.json');
  const manifest = {
    version,
    generated: new Date().toISOString(),
    items,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // review.html — copy template, substitute {{VERSION}}
  const htmlPath = path.join(releaseDir, 'review.html');
  const tplPath = templatePath();
  let html: string;
  try {
    html = fs.readFileSync(tplPath, 'utf8');
  } catch (err) {
    // Non-fatal: if the template is missing (edge case during dev), skip the
    // HTML write. The manifest still gets written and can be read directly.
    console.log(`  ⚠️  review template not found at ${tplPath} — skipping review.html`);
    return { manifestPath, htmlPath: '' };
  }
  // Inline the manifest as a JS literal so the page works when opened directly
  // via file:// (browsers block sibling-file fetch() requests over file://).
  // Use </script>-safe encoding so the JSON can never break out of the script tag.
  const safeJson = JSON.stringify(manifest)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--');

  html = html
    .replace(/\{\{VERSION\}\}/g, escapeHtml(version))
    .replace(/\{\{MANIFEST_JSON\}\}/g, safeJson);
  fs.writeFileSync(htmlPath, html);

  return { manifestPath, htmlPath };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
