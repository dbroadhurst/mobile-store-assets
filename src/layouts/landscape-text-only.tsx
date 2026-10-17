import * as React from 'react';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUriOrNull, bufferToDataUri } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// LANDSCAPE-TEXT-ONLY
// Wide canvas, no phone. Icon on the left (large, circular) + headline +
// subhead on the right, all vertically centred. Port of
// src/layouts/landscape-text-only.ts.

interface TextOnlyViewProps {
  bgUrl: string;
  iconUrl: string | null;
  headline: string;
  subheadline: string;
  headlineColor: string;
  subheadColor: string;
}

function TextOnlyView({
  bgUrl, iconUrl, headline, subheadline, headlineColor, subheadColor,
}: TextOnlyViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        padding: '0 6cqw',
        gap: '4cqw',
      }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          style={{
            width: 'min(55cqh, 30cqw)',
            aspectRatio: 1,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
            boxShadow: '0 4cqh 8cqh rgba(0,0,0,0.25)',
          }}
        />
      ) : null}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3cqh' }}>
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(72px, 14cqh, 280px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 900,
            color: headlineColor,
            textTransform: 'uppercase',
            textWrap: 'balance',
            maxWidth: '20ch',
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            data-zone="subheadline"
            style={{
              fontSize: 'clamp(22px, 5cqh, 100px)',
              fontWeight: 500,
              color: subheadColor,
              maxWidth: '36ch',
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function landscapeTextOnly(input: LayoutInput): Promise<LayoutResult> {
  const iconPath = path.join(input.projectRoot, input.config.app.icon);
  return renderAndCapture(
    <TextOnlyView
      bgUrl={bufferToDataUri(input.background)}
      iconUrl={fileToDataUriOrNull(iconPath)}
      headline={stripBrackets(input.screenshot.headline)}
      subheadline={input.screenshot.subheadline}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
