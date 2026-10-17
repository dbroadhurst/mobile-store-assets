import * as React from 'react';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri, cssAspectRatio } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// VERTICAL BENTO
// Three vertical bands: headline strip top, full-width phone card middle,
// two equal stat tiles bottom. Stats use "LABEL|NUMBER|caption" format in
// features[].

interface Stat { label: string; number: string; caption: string; }

function parseStat(s: string): Stat {
  const parts = s.split('|').map(p => p.trim());
  return { label: parts[0] ?? 'STAT', number: parts[1] ?? '', caption: parts[2] ?? '' };
}

interface BentoViewProps {
  bgUrl: string;
  screenshotUrl: string;
  screenshotAspect: string;
  headline: string;
  stats: Stat[];
  headlineColor: string;
  accent: string;
}

function BentoView({ bgUrl, screenshotUrl, screenshotAspect, headline, stats, headlineColor, accent }: BentoViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        padding: '4cqh 6cqw',
        gap: '2.5cqh',
      }}
    >
      {/* Top headline strip */}
      <div
        style={{
          padding: '2.5cqh 4cqw',
          borderRadius: '4cqw',
          background: 'rgba(10,15,31,calc(0.62 + var(--scrim-boost, 0)))',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(56px, 5.0cqh, 110px)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            fontWeight: 900,
            color: headlineColor,
            textWrap: 'balance',
          }}
        >
          {headline}
        </div>
      </div>

      {/* Middle: white phone card. Phone is height-constrained so it fits. */}
      <div
        style={{
          flex: 1,
          minHeight: '40cqh',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: '4cqw',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3cqh 5cqw',
        }}
      >
        <img
          src={screenshotUrl}
          alt=""
          style={{
            height: '100%',
            aspectRatio: screenshotAspect,
            objectFit: 'cover',
            borderRadius: '3cqw',
            boxShadow: '0 2cqh 5cqh rgba(0,0,0,0.18)',
          }}
        />
      </div>

      {/* Bottom: 2 stat tiles, last in accent */}
      <div style={{ display: 'flex', gap: '2.5cqw' }}>
        {stats.map((s, i) => {
          const isAccent = i === 1 && stats.length > 1;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                minHeight: '15cqh',
                borderRadius: '4cqw',
                background: isAccent ? accent : 'rgba(10,15,31,calc(0.62 + var(--scrim-boost, 0)))',
                backdropFilter: isAccent ? undefined : 'blur(22px) saturate(160%)',
                WebkitBackdropFilter: isAccent ? undefined : 'blur(22px) saturate(160%)',
                padding: '2.5cqh 4cqw',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                data-zone="label"
                style={{
                  fontSize: 'clamp(28px, 2.4cqh, 56px)',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: isAccent ? '#1A2330' : accent,
                  textTransform: 'uppercase',
                }}
              >
                {s.label}
              </div>
              <div
                data-zone="headline"
                style={{
                  fontSize: s.number.length <= 2
                    ? 'clamp(90px, 8.0cqh, 220px)'
                    : 'clamp(60px, 6.0cqh, 160px)',
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: isAccent ? '#1A2330' : headlineColor,
                }}
              >
                {s.number}
              </div>
              <div
                data-zone="caption"
                style={{
                  fontSize: 'clamp(22px, 2.0cqh, 44px)',
                  fontWeight: 500,
                  color: isAccent ? 'rgba(26,35,48,0.82)' : 'rgba(255,255,255,0.86)',
                }}
              >
                {s.caption}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export async function verticalBento(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('vertical-bento requires a screenshot source');
  }
  const stats = (input.screenshot.features ?? []).slice(0, 2).map(parseStat);

  return renderAndCapture(
    <BentoView
      bgUrl={bufferToDataUri(input.background)}
      screenshotUrl={fileToDataUri(input.screenshotPath)}
      screenshotAspect={cssAspectRatio(input.screenshotAspectRatio)}
      headline={stripBrackets(input.screenshot.headline)}
      stats={stats}
      headlineColor={input.theme.headline_color}
      accent={input.theme.accent}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
