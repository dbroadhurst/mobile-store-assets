import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export type Provider = 'google' | 'openai';

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
function toOpenAISize(aspectRatio: string): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspectRatio === '16:9') return '1536x1024';
  if (aspectRatio === '9:16' || aspectRatio === '3:4') return '1024x1536';
  return '1024x1024';
}

// ── Unified API ───────────────────────────────────────────────────────────────

export async function generateBackground(
  provider: Provider,
  model: string,
  apiKey: string,
  prompt: string,
  aspectRatio: string,
): Promise<Buffer> {
  const fullPrompt = `${prompt}. No text. No people. No UI elements. No logos.`;

  if (provider === 'openai') {
    const resp = await openaiClient(apiKey).images.generate({
      model,
      prompt: fullPrompt,
      n: 1,
      size: toOpenAISize(aspectRatio),
      quality: 'medium',
      // @ts-ignore — output_format is valid for gpt-image-1 but not yet in all SDK type defs
      output_format: 'png',
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
}

export async function generateFeatureGraphicBg(
  provider: Provider,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<Buffer> {
  const fullPrompt = `${prompt}. Wide landscape format. No text. No people. No UI elements.`;

  if (provider === 'openai') {
    const resp = await openaiClient(apiKey).images.generate({
      model,
      prompt: fullPrompt,
      n: 1,
      size: '1536x1024',
      quality: 'medium',
      // @ts-ignore
      output_format: 'png',
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
}
