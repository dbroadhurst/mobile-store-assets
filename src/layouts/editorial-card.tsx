import * as React from 'react';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri, cssAspectRatio } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// EDITORIAL CARD
// Phone is the dominant hero: full-width, slight -3° tilt, clipping the
// canvas top. Solid panel anchors to bottom-left with a vertical accent rule
// and overlaps the phone. Magazine feel.

interface EditorialViewProps {
  bgUrl: string;
  screenshotUrl: string;
  screenshotAspect: string;
  headline: string;
  body: string;
  stepLabel: string;
  headlineColor: string;
  subheadColor: string;
  accent: string;
}

function EditorialView({
  bgUrl, screenshotUrl, screenshotAspect, headline, body, stepLabel, headlineColor, subheadColor, accent,
}: EditorialViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Phone — 78% wide, tilted -3°, top clips the canvas. transform-origin
          keeps the rotation centered on the phone itself. overflow: hidden
          on canvas-root clips the protrusion. */}
      <img
        src={screenshotUrl}
        alt=""
        style={{
          position: 'absolute',
          top: '-3cqh',
          left: '50%',
          width: '78cqw',
          aspectRatio: screenshotAspect,
          objectFit: 'cover',
          transform: 'translateX(-50%) rotate(-3deg)',
          transformOrigin: 'center center',
          borderRadius: '5cqw',
          boxShadow: '0 4cqh 10cqh rgba(0,0,0,0.35), 0 0 0 1cqw rgba(0,0,0,0.20)',
        }}
      />

      {/* Bottom-left panel with vertical accent rule on the right edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: '3cqh',
          width: '74cqw',
          minHeight: '30cqh',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            flex: 1,
            background: 'rgba(10,15,31,calc(0.78 + var(--scrim-boost, 0)))',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            borderTopRightRadius: '3cqw',
            borderBottomRightRadius: '3cqw',
            padding: '3cqh 5cqw',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '1.5cqh',
          }}
        >
          {stepLabel ? (
            <div
              data-zone="badge"
              style={{
                alignSelf: 'flex-start',
                padding: '0.6cqh 2cqw',
                borderRadius: '9999px',
                background: accent,
                color: '#1A2330',
                fontSize: 'var(--text-badge)',
                fontWeight: 800,
                letterSpacing: '0.06em',
              }}
            >
              {stepLabel}
            </div>
          ) : null}
          <div
            data-zone="headline"
            style={{
              fontSize: 'clamp(56px, 5.6cqh, 130px)',
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
              fontWeight: 900,
              color: headlineColor,
              textWrap: 'balance',
            }}
          >
            {headline}
          </div>
          {body ? (
            <div
              data-zone="caption"
              style={{
                fontSize: 'var(--text-subheadline)',
                lineHeight: 'var(--leading-subheadline)',
                fontWeight: 500,
                color: subheadColor,
                textWrap: 'balance',
              }}
            >
              {body}
            </div>
          ) : null}
        </div>
        {/* Accent rule — 1cqw wide on the panel's right edge */}
        <div style={{ width: '1cqw', background: accent }} />
      </div>
    </div>
  );
}

export async function editorialCard(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('editorial-card requires a screenshot source');
  }
  const stepLabel = input.screenshot.badge_label && input.screenshot.badge_count
    ? `${input.screenshot.badge_label.toUpperCase()} ${input.screenshot.badge_count}`
    : (input.screenshot.badge_label?.toUpperCase() ?? '');

  return renderAndCapture(
    <EditorialView
      bgUrl={bufferToDataUri(input.background)}
      screenshotUrl={fileToDataUri(input.screenshotPath)}
      screenshotAspect={cssAspectRatio(input.screenshotAspectRatio)}
      headline={stripBrackets(input.screenshot.headline)}
      body={input.screenshot.subheadline}
      stepLabel={stepLabel}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
      accent={input.theme.accent}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
