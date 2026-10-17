import * as React from 'react';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// LANDSCAPE-SPLIT
// Wide canvas, horizontal split: top text band (left-aligned headline +
// subhead), bottom phone band centred.

interface SplitViewProps {
  bgUrl: string;
  screenshotUrl: string;
  headline: string;
  subheadline: string;
  headlineColor: string;
  subheadColor: string;
}

function SplitView({ bgUrl, screenshotUrl, headline, subheadline, headlineColor, subheadColor }: SplitViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        padding: '5cqh 6cqw',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2cqh' }}>
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(64px, 11cqh, 220px)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            fontWeight: 800,
            color: headlineColor,
            textAlign: 'left',
            textWrap: 'balance',
            maxWidth: '24ch',
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            data-zone="subheadline"
            style={{
              fontSize: 'clamp(20px, 4.5cqh, 90px)',
              fontWeight: 500,
              color: subheadColor,
              maxWidth: '40ch',
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      {/* Phone — fills remaining lower area, centered. Native aspect retained
          via aspect-ratio; height-driven so it never overflows. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: '3cqh',
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
            boxShadow: '0 3cqh 8cqh rgba(0,0,0,0.30)',
          }}
        />
      </div>
    </div>
  );
}

export async function landscapeSplit(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('landscape-split requires a screenshot source');
  }
  return renderAndCapture(
    <SplitView
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
