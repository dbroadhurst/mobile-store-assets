import * as React from 'react';
import fs from 'fs';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri, cssAspectRatio } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// DUAL PHONE
// Two phones tilted toward each other (one primary screenshot, one secondary
// if provided; otherwise reuse primary). Headline panel above, optional chip
// row below.

interface DualPhoneViewProps {
  bgUrl: string;
  frontUrl: string;
  backUrl: string;
  frontAspect: string;
  backAspect: string;
  headline: string;
  subheadline: string;
  chips: string[];
  headlineColor: string;
  subheadColor: string;
  accent: string;
}

function DualPhoneView({
  bgUrl, frontUrl, backUrl, frontAspect, backAspect, headline, subheadline, chips,
  headlineColor, subheadColor, accent,
}: DualPhoneViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Headline panel — top */}
      <div
        style={{
          position: 'absolute',
          top: '5cqh',
          left: '5cqw',
          right: '5cqw',
          padding: '3cqh 4cqw',
          borderRadius: '4cqw',
          background: 'rgba(10,15,31,calc(0.62 + var(--scrim-boost, 0)))',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1cqh',
        }}
      >
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(56px, 5.5cqh, 120px)',
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
              fontWeight: 500,
              color: subheadColor,
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      {/* Two phones — back phone tilted +6°, front phone tilted -6°, slightly
          overlapping. z-index puts front on top. */}
      <img
        src={backUrl}
        alt=""
        style={{
          position: 'absolute',
          top: '32cqh',
          left: '40cqw',
          width: '46cqw',
          aspectRatio: backAspect,
          objectFit: 'cover',
          transform: 'rotate(6deg)',
          transformOrigin: 'center center',
          borderRadius: '5cqw',
          boxShadow: '0 4cqh 10cqh rgba(0,0,0,0.40)',
          zIndex: 1,
        }}
      />
      <img
        src={frontUrl}
        alt=""
        style={{
          position: 'absolute',
          top: '32cqh',
          left: '16cqw',
          width: '46cqw',
          aspectRatio: frontAspect,
          objectFit: 'cover',
          transform: 'rotate(-6deg)',
          transformOrigin: 'center center',
          borderRadius: '5cqw',
          boxShadow: '0 4cqh 10cqh rgba(0,0,0,0.40)',
          zIndex: 2,
        }}
      />

      {/* Footer chips (optional) */}
      {chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            bottom: '2.5cqh',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: '2cqw',
          }}
        >
          {chips.map((label, i, arr) => {
            const isAccent = i === arr.length - 1 && arr.length > 1;
            return (
              <div
                key={i}
                data-zone="badge"
                style={{
                  padding: '1cqh 3cqw',
                  borderRadius: '9999px',
                  background: isAccent ? accent : '#FFFFFF',
                  color: isAccent ? '#1A2330' : '#1E2A4A',
                  fontSize: 'var(--text-badge)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export async function dualPhone(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('dual-phone requires a screenshot source');
  }
  const frontUrl = fileToDataUri(input.screenshotPath);
  const backUrl = input.screenshotPathSecondary && fs.existsSync(input.screenshotPathSecondary)
    ? fileToDataUri(input.screenshotPathSecondary)
    : frontUrl;

  // Front uses primary screenshot, back uses secondary if present (else
  // primary). Each gets its own aspect ratio so a tablet shot doesn't get
  // squashed into a phone slot.
  const frontAspect = cssAspectRatio(input.screenshotAspectRatio);
  const backAspect = input.screenshotPathSecondary && fs.existsSync(input.screenshotPathSecondary)
    ? cssAspectRatio(input.screenshotAspectRatioSecondary)
    : frontAspect;

  return renderAndCapture(
    <DualPhoneView
      bgUrl={bufferToDataUri(input.background)}
      frontUrl={frontUrl}
      backUrl={backUrl}
      frontAspect={frontAspect}
      backAspect={backAspect}
      headline={stripBrackets(input.screenshot.headline)}
      subheadline={input.screenshot.subheadline}
      chips={(input.screenshot.features ?? []).slice(0, 2).filter(Boolean)}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
      accent={input.theme.accent}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
