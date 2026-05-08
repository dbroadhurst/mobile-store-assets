import fs from 'fs';
import path from 'path';
import type { Spec, AppStoreText, GooglePlayText } from './types.js';
import { DEFAULT_LOCALE } from './config.js';

// Character limits enforced by the stores. Used to produce inline warnings.
const LIMITS = {
  google_play: {
    title: 30,
    short_description: 80,
    full_description: 4000,
    recent_changes: 500,
  },
  app_store: {
    name: 30,
    subtitle: 30,
    promotional_text: 170,
    description: 4000,
    keywords: 100,
  },
} as const;

export interface Warning {
  locale: string;
  store: 'google_play' | 'app_store';
  field: string;
  length: number;
  limit: number;
}

function fieldHeader(name: string, value: string, limit: number, warnings: Warning[], locale: string, store: 'google_play' | 'app_store') {
  const len = (value ?? '').length;
  if (len > limit) warnings.push({ locale, store, field: name, length: len, limit });
  const flag = len > limit ? ' ⚠️ over limit' : '';
  return `## ${name}  (${len}/${limit} chars${flag})`;
}

interface RenderOpts {
  appName: string;
  version: string;
  locale: string;
  setId: string;
  /** Path tag inserted into the "upload from" hint (relative to outDir). */
  pathTag: string;
}

function googlePlayMd(text: GooglePlayText, opts: RenderOpts, warnings: Warning[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const tag = [opts.locale === DEFAULT_LOCALE ? '' : opts.locale, `set-${opts.setId}`]
    .filter(Boolean).join(' · ');
  return [
    `# Google Play Store Listing — ${opts.appName} ${opts.version}${tag ? ' · ' + tag : ''}`,
    `_Generated ${date} · Ready to paste into Google Play Console → Store listing_`,
    '',
    '---',
    '',
    fieldHeader('Title', text.title ?? '', LIMITS.google_play.title, warnings, opts.locale, 'google_play'),
    text.title ?? '',
    '',
    fieldHeader('Short Description', text.short_description ?? '', LIMITS.google_play.short_description, warnings, opts.locale, 'google_play'),
    text.short_description ?? '',
    '',
    fieldHeader('Full Description', text.full_description ?? '', LIMITS.google_play.full_description, warnings, opts.locale, 'google_play'),
    text.full_description ?? '',
    '',
    fieldHeader("What's New", text.recent_changes ?? '', LIMITS.google_play.recent_changes, warnings, opts.locale, 'google_play'),
    text.recent_changes ?? '',
    '',
    '---',
    `_Upload screenshots from: \`${opts.pathTag}google-play/phone/\` and \`tablet/\`_`,
    `_Upload feature graphic from: \`${opts.pathTag}google-play/feature-graphic.png\`_`,
    '',
  ].join('\n');
}

function appStoreMd(text: AppStoreText, opts: RenderOpts, warnings: Warning[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const tag = [opts.locale === DEFAULT_LOCALE ? '' : opts.locale, `set-${opts.setId}`]
    .filter(Boolean).join(' · ');
  return [
    `# App Store Listing — ${opts.appName} ${opts.version}${tag ? ' · ' + tag : ''}`,
    `_Generated ${date} · Ready to paste into App Store Connect → App Information_`,
    '',
    '---',
    '',
    fieldHeader('App Name', text.name ?? '', LIMITS.app_store.name, warnings, opts.locale, 'app_store'),
    text.name ?? '',
    '',
    fieldHeader('Subtitle', text.subtitle ?? '', LIMITS.app_store.subtitle, warnings, opts.locale, 'app_store'),
    text.subtitle ?? '',
    '',
    fieldHeader('Promotional Text', text.promotional_text ?? '', LIMITS.app_store.promotional_text, warnings, opts.locale, 'app_store'),
    text.promotional_text ?? '',
    '',
    fieldHeader('Description', text.description ?? '', LIMITS.app_store.description, warnings, opts.locale, 'app_store'),
    text.description ?? '',
    '',
    fieldHeader('Keywords', text.keywords ?? '', LIMITS.app_store.keywords, warnings, opts.locale, 'app_store'),
    text.keywords ?? '',
    '',
    '---',
    `_Upload screenshots from: \`${opts.pathTag}app-store/iphone-6.9/\` and \`ipad-pro-12.9/\`_`,
    '',
  ].join('\n');
}

/**
 * Write listing markdown for every (locale × set) combination. The same store
 * text is shared across sets within a locale — set differentiation is purely
 * visual (layouts/themes/headlines), not store copy.
 */
export function writeStoreListings(
  spec: Spec,
  appName: string,
  outDir: string,
  locales: string[],
  setIds: string[],
): { warnings: Warning[]; written: string[] } {
  const warnings: Warning[] = [];
  const written: string[] = [];

  for (const locale of locales) {
    const gp = locale === DEFAULT_LOCALE
      ? spec.google_play
      : spec.locales?.[locale]?.google_play ?? spec.google_play;
    const as = locale === DEFAULT_LOCALE
      ? spec.app_store
      : spec.locales?.[locale]?.app_store ?? spec.app_store;

    for (const setId of setIds) {
      const segments = [
        locale === DEFAULT_LOCALE ? '' : locale,
        setIds.length > 1 ? `set-${setId}` : '',
      ].filter(Boolean);

      const localeDir = path.join(outDir, ...segments);
      const pathTag = segments.length ? segments.join('/') + '/' : '';

      const opts: RenderOpts = {
        appName, version: spec.version, locale, setId, pathTag,
      };

      const gpPath = path.join(localeDir, 'google-play', 'store-listing.md');
      const asPath = path.join(localeDir, 'app-store', 'store-listing.md');
      fs.mkdirSync(path.dirname(gpPath), { recursive: true });
      fs.mkdirSync(path.dirname(asPath), { recursive: true });

      fs.writeFileSync(gpPath, googlePlayMd(gp, opts, warnings));
      fs.writeFileSync(asPath, appStoreMd(as, opts, warnings));

      written.push(gpPath, asPath);
    }
  }

  return { warnings, written };
}
