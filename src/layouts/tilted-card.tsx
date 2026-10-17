import * as React from 'react';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri, cssAspectRatio } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// TILTED CARD
// Phone presented inside a tilted floating white card ("product photo" feel).
// Bottom panel with headline + subhead.

interface TiltedViewProps {
  bgUrl: string;
  screenshotUrl: string;
  screenshotAspect: string;
  headline: string;
  subheadline: string;
  headlineColor: string;
  subheadColor: string;
}

function TiltedView({
  bgUrl, screenshotUrl, screenshotAspect, headline, subheadline, headlineColor, subheadColor,
}: TiltedViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Tilted white card with phone inside. The card itself rotates -4°;
          drop-shadow filter gives it the floating product-photo look. */}
      <div
        style={{
          position: 'absolute',
          top: '6cqh',
          left: '50%',
          transform: 'translateX(-50%) rotate(-4deg)',
          transformOrigin: 'center center',
          background: '#FFFFFF',
          padding: '3cqw',
          borderRadius: '6cqw',
          filter: 'drop-shadow(0 4cqh 8cqh rgba(0,0,0,0.30))',
          display: 'flex',
        }}
      >
        <img
          src={screenshotUrl}
          alt=""
          style={{
            width: '62cqw',
            aspectRatio: screenshotAspect,
            objectFit: 'cover',
            borderRadius: '4.5cqw',
            display: 'block',
          }}
        />
      </div>

      {/* Bottom panel — glassy, holds headline + subheadline */}
      <div
        style={{
          position: 'absolute',
          left: '5cqw',
          right: '5cqw',
          bottom: '4cqh',
          minHeight: '22cqh',
          borderRadius: '4cqw',
          padding: '2.5cqh 4cqw',
          background: 'rgba(10,15,31,calc(0.62 + var(--scrim-boost, 0)))',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '1.5cqh',
        }}
      >
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(72px, 6.0cqh, 140px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 900,
            color: headlineColor,
            textWrap: 'balance',
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
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function tiltedCard(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('tilted-card requires a screenshot source');
  }
  return renderAndCapture(
    <TiltedView
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
