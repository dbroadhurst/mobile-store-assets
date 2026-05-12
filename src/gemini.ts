import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import sharp from 'sharp';
import { withRetry } from './retry.js';

export type Provider = 'google' | 'openai';
export type OpenAIQuality = 'low' | 'medium' | 'high' | 'auto';

// ── Google Imagen ─────────────────────────────────────────────────────────────

let _googleClient: GoogleGenAI | null = null;
function googleClient(apiKey: string): GoogleGenAI {
  if (!_googleClient) _googleClient = new GoogleGenAI({ apiKey });
  return _googleClient;
}

function toBuffer(bytes: string | Uint8Array | undefined): Buffer {
  if (!bytes) throw new Error('Imagen returned no image bytes');
  return typeof bytes === 'string' ? Buffer.from(bytes, 'base64') : Buffer.from(bytes);
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

let _openaiClient: OpenAI | null = null;
function openaiClient(apiKey: string): OpenAI {
  if (!_openaiClient) _openaiClient = new OpenAI({ apiKey });
  return _openaiClient;
}

// gpt-image-1 supports 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape)
export function toOpenAISize(aspectRatio: string): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspectRatio === '16:9') return '1536x1024';
  if (aspectRatio === '9:16' || aspectRatio === '3:4') return '1024x1536';
  return '1024x1024';
}

// Returns a string used as a stable cache-key fragment. Change in size = cache miss.
export function sizeKey(provider: Provider, aspectRatio: string): string {
  return provider === 'openai' ? toOpenAISize(aspectRatio) : aspectRatio;
}

// ── Dry-run flat background (no API call) ─────────────────────────────────────

export async function flatBackground(
  width: number,
  height: number,
  fromHex: string,
  toHex: string,
): Promise<Buffer> {
  // Linear vertical gradient between two hex colors. Used for --dry-run so the
  // CLI produces a representative composite without spending API calls.
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${fromHex}"/>
        <stop offset="100%" stop-color="${toHex}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Unified API ───────────────────────────────────────────────────────────────

export interface GenerateOptions {
  provider: Provider;
  model: string;
  apiKey: string;
  prompt: string;
  aspectRatio: string;
  quality?: OpenAIQuality;   // OpenAI only; ignored by Imagen
  label?: string;            // shown in retry log
}

export async function generateBackground(opts: GenerateOptions): Promise<Buffer> {
  const { provider, model, apiKey, prompt, aspectRatio, quality = 'medium', label = 'image-gen' } = opts;
  const fullPrompt = `${prompt}. No text. No people. No UI elements. No logos.`;

  return withRetry(async () => {
    if (provider === 'openai') {
      // background: 'opaque' tells gpt-image-1 not to return a transparent
      // PNG — store assets must be 24-bit, and the default 'auto' lets the
      // model decide (occasionally transparent). Defense in depth alongside
      // the flatten + removeAlpha post-step in index.ts.
      const resp = await openaiClient(apiKey).images.generate({
        model,
        prompt: fullPrompt,
        n: 1,
        size: toOpenAISize(aspectRatio),
        quality,
        output_format: 'png',
        background: 'opaque',
      });
      const b64 = resp.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI returned no image bytes');
      return Buffer.from(b64, 'base64');
    }

    const response = await googleClient(apiKey).models.generateImages({
      model,
      prompt: fullPrompt,
      config: { numberOfImages: 1, aspectRatio },
    });
    return toBuffer(response.generatedImages?.[0]?.image?.imageBytes);
  }, { label });
}

export async function generateFeatureGraphicBg(opts: Omit<GenerateOptions, 'aspectRatio'>): Promise<Buffer> {
  const { provider, model, apiKey, prompt, quality = 'medium', label = 'feature-graphic' } = opts;
  const fullPrompt = `${prompt}. Wide landscape format. No text. No people. No UI elements.`;

  return withRetry(async () => {
    if (provider === 'openai') {
      const resp = await openaiClient(apiKey).images.generate({
        model,
        prompt: fullPrompt,
        n: 1,
        size: '1536x1024',
        quality,
        output_format: 'png',
        background: 'opaque',
      });
      const b64 = resp.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI returned no image bytes');
      return Buffer.from(b64, 'base64');
    }

    const response = await googleClient(apiKey).models.generateImages({
      model,
      prompt: fullPrompt,
      config: { numberOfImages: 1, aspectRatio: '16:9' },
    });
    return toBuffer(response.generatedImages?.[0]?.image?.imageBytes);
  }, { label });
}
