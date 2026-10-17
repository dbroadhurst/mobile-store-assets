import * as React from 'react';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUriOrNull, bufferToDataUri } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// WEAR OS — 384×384, 1:1
// Phone-screenshot layouts don't make sense at watch size. Icon + first word
// of the headline.

interface WearOsViewProps {
  bgUrl: string;
  iconUrl: string | null;
  word: string;
  headlineColor: string;
}

function WearOsView({ bgUrl, iconUrl, word, headlineColor }: WearOsViewProps) {
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
        justifyContent: 'center',
        gap: '6cqh',
      }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          style={{
            width: '42cqw',
            height: '42cqw',
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: '0 2cqh 4cqh rgba(0,0,0,0.30)',
          }}
        />
      ) : null}
      <div
        data-zone="headline"
        style={{
          fontSize: 'clamp(28px, 14cqh, 60px)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: headlineColor,
          textAlign: 'center',
        }}
      >
        {word}
      </div>
    </div>
  );
}

export async function wearOs(input: LayoutInput): Promise<LayoutResult> {
  const iconPath = path.join(input.projectRoot, input.config.app.icon);
  const word = stripBrackets(input.screenshot.headline).split(/\s+/).filter(Boolean)[0] ?? '';

  return renderAndCapture(
    <WearOsView
      bgUrl={bufferToDataUri(input.background)}
      iconUrl={fileToDataUriOrNull(iconPath)}
      word={word}
      headlineColor={input.theme.headline_color}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
