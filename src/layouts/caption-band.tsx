import * as React from 'react';
import fs from 'fs';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { cssAspectRatio } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// CAPTION BAND
// Phone hero in the top ~68%, soft-band caption at the bottom. The band uses
// `backdrop-filter: blur(24px) saturate(180%)` over a feathered linear
// gradient so the caption reads against whatever sits behind it (phone
// screen, AI background, or a mix). Phone slot adopts the source's natural
// aspect via `screenshotAspect` so tablet sources don't get squashed into
// a phone shape.

function fileToDataUri(p: string): string {
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const b64 = fs.readFileSync(p).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function bufferToDataUri(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

interface CaptionBandViewProps {
  bgUrl: string;
  screenshotUrl: string;
  screenshotAspect: string;
  headline: string;
  subheadline: string;
  headlineColor: string;
  subheadColor: string;
}

function CaptionBandView({
  bgUrl, screenshotUrl, screenshotAspect, headline, subheadline, headlineColor, subheadColor,
}: CaptionBandViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Phone slot — top 68% of canvas, never overlaps the band */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center"
        style={{ top: '8cqh', bottom: '32cqh', paddingInline: '14cqw' }}
      >
        <img
          src={screenshotUrl}
          alt=""
          className="block"
          style={{
            height: '100%',
            maxWidth: '100%',
            aspectRatio: screenshotAspect,
            objectFit: 'cover',
            borderRadius: '6cqw',
            boxShadow: '0 4cqh 10cqh rgba(0,0,0,0.35), 0 0 0 1cqw rgba(0,0,0,0.25)',
          }}
        />
      </div>

      {/* Caption band — bottom 32% of canvas */}
      <div
        className="absolute left-0 right-0 bottom-0 flex flex-col items-center justify-center text-center"
        style={{
          height: '32cqh',
          padding: '4cqh 8cqw 6cqh',
          gap: '2cqh',
          background:
            'linear-gradient(180deg, transparent 0%, ' +
            'rgba(0,0,0,calc(0.30 + var(--scrim-boost, 0))) 35%, ' +
            'rgba(0,0,0,calc(0.50 + var(--scrim-boost, 0))) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        }}
      >
        <div
          data-zone="headline"
          style={{
            fontSize: 'var(--text-headline)',
            lineHeight: 'var(--leading-headline)',
            letterSpacing: 'var(--tracking-headline)',
            fontWeight: 800,
            color: headlineColor,
            textWrap: 'balance',
            maxWidth: '22ch',
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            data-zone="subheadline"
            style={{
              fontSize: 'var(--text-subheadline)',
              lineHeight: 'var(--leading-subheadline)',
              fontWeight: 500,
              color: subheadColor,
              textWrap: 'balance',
              maxWidth: '32ch',
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function captionBand(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('caption-band requires a screenshot source');
  }

  return renderAndCapture(
    <CaptionBandView
      bgUrl={bufferToDataUri(input.background)}
      screenshotUrl={fileToDataUri(input.screenshotPath)}
      screenshotAspect={cssAspectRatio(input.screenshotAspectRatio)}
      headline={stripBrackets(input.screenshot.headline)}
      subheadline={input.screenshot.subheadline}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
