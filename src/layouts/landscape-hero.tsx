import * as React from 'react';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// LANDSCAPE-HERO
// Centred uppercase headline + subhead + large centred phone. Strong opener
// for landscape-native apps.

interface HeroViewProps {
  bgUrl: string;
  screenshotUrl: string;
  headline: string;
  subheadline: string;
  headlineColor: string;
  subheadColor: string;
}

function HeroView({ bgUrl, screenshotUrl, headline, subheadline, headlineColor, subheadColor }: HeroViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '6cqh 6cqw',
      }}
    >
      <div
        data-zone="headline"
        style={{
          fontSize: 'clamp(72px, 13cqh, 260px)',
          lineHeight: 1.05,
          letterSpacing: '-0.025em',
          fontWeight: 900,
          color: headlineColor,
          textAlign: 'center',
          textWrap: 'balance',
          maxWidth: '24ch',
          textTransform: 'uppercase',
        }}
      >
        {headline}
      </div>
      {subheadline ? (
        <div
          data-zone="subheadline"
          style={{
            marginTop: '3cqh',
            fontSize: 'clamp(22px, 4.5cqh, 90px)',
            fontWeight: 500,
            color: subheadColor,
            textAlign: 'center',
            maxWidth: '40ch',
          }}
        >
          {subheadline}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          marginTop: '4cqh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <img
          src={screenshotUrl}
          alt=""
          style={{
            height: '100%',
            maxWidth: '90cqw',
            objectFit: 'contain',
            borderRadius: '3cqw',
            boxShadow: '0 4cqh 10cqh rgba(0,0,0,0.35)',
          }}
        />
      </div>
    </div>
  );
}

export async function landscapeHero(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('landscape-hero requires a screenshot source');
  }
  return renderAndCapture(
    <HeroView
      bgUrl={bufferToDataUri(input.background)}
      screenshotUrl={fileToDataUri(input.screenshotPath)}
      headline={stripBrackets(input.screenshot.headline)}
      subheadline={input.screenshot.subheadline}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
