// ─── Spec (spec.yaml) ────────────────────────────────────────────────────────

export type Layout = 'hero-center' | 'split-right' | 'split-left' | 'feature-callout' | 'cta';

export interface Callout {
  x: number;       // fraction of screenshot width from left
  y: number;       // fraction of screenshot height from top
  width: number;   // fraction of screenshot width
  height: number;  // fraction of screenshot height
}

export interface ScreenshotSpec {
  id: string;
  layout: Layout;
  headline: string;
  subheadline: string;
  imagen_prompt: string;
  callout?: Callout | null;
  cta_text?: string;
  features?: string[];
  sources: Partial<Record<Platform, string>>;
}

export interface Style {
  theme_prompt: string;
  device_frame: 'white-border' | 'none';
  headline_color: string;
  subheadline_color: string;
  accent_color: string;
}

export interface Spec {
  version: string;
  google_play: {
    title: string;
    short_description: string;
    full_description: string;
    recent_changes: string;
  };
  app_store: {
    name: string;
    subtitle: string;
    description: string;
    keywords: string;
    promotional_text: string;
  };
  screenshots: ScreenshotSpec[];
  style: Style;
}

// ─── Store config (.store-config.yaml) ───────────────────────────────────────

export interface StoreConfig {
  app: {
    name: string;
    bundle_id: string;
    category: string;
    icon: string;
    platforms: string[];
  };
  brand: {
    primary_color: string;
    secondary_color: string;
    background_gradient_from: string;
    background_gradient_to: string;
    theme_motif: string;
  };
  imagen?: {
    model: string;
  };
  openai?: {
    model: string;
    quality?: 'low' | 'medium' | 'high' | 'auto';
  };
}

// ─── Runtime types ────────────────────────────────────────────────────────────

export type Platform = 'android-phone' | 'android-tablet' | 'ios-phone' | 'ios-tablet';

export interface PlatformConfig {
  width: number;
  height: number;
  aspectRatio: string;
  outputDir: string;   // relative to output root
}

export interface LayoutInput {
  background: Buffer;
  screenshotPath: string | null;   // null for cta layout
  spec: ScreenshotSpec;
  style: Style;
  config: StoreConfig;
  targetWidth: number;
  targetHeight: number;
}
