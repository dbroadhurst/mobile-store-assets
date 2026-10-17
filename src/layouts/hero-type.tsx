import * as React from 'react';
import fs from 'fs';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// HERO TYPE
// Icon + benefit headline panel + chip row. No phone screenshot.
//   - `[BRACKETED]` keywords in the headline render in `theme.accent`
//     (see `renderHeadline` below).
//   - Up to 4 entries in `features[]` become a flex row of pill chips; the
//     last chip uses the accent fill, the rest are white.
//   - The panel uses `backdrop-filter: blur(22px) saturate(160%)` so the
//     headline stays readable against AI or gradient backgrounds.

const ICON_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

function iconToDataUri(p: string): string | null {
  if (!fs.existsSync(p)) return null;
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ICON_MIME[ext] ?? 'image/png';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}

function bufferToDataUri(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Render the headline with an optional accent on any `[bracketed]` keyword.
 * Returns an array of React nodes so the renderer can flow them on one line
 * with `text-wrap: balance`.
 */
function renderHeadline(raw: string, accent: string): React.ReactNode[] {
  // Split on `[word]` while keeping the captured groups, so we can wrap them.
  const parts = raw.split(/(\[[^\]]+\])/g);
  return parts.map((p, i) => {
    const m = /^\[([^\]]+)\]$/.exec(p);
    if (m) {
      return <span key={i} style={{ color: accent }}>{m[1].toUpperCase()}</span>;
    }
    return <React.Fragment key={i}>{p.toUpperCase()}</React.Fragment>;
  });
}

interface HeroViewProps {
  bgUrl: string;
  iconUrl: string | null;
  headlineNodes: React.ReactNode[];
  subheadline: string;
  chips: string[];
  headlineColor: string;
  subheadColor: string;
  accent: string;
}

function HeroView({
  bgUrl, iconUrl, headlineNodes, subheadline, chips, headlineColor, subheadColor, accent,
}: HeroViewProps) {
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
      }}
    >
      {/* Icon — circular, at ~20% canvas height. Width is a fraction of
          canvas WIDTH (not height) so the icon stays proportional to the
          phone screen, matching the sharp layout. */}
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 'calc(20.3cqh - 13.1cqw)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '26.2cqw',
            height: '26.2cqw',
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: '0 2cqh 5cqh rgba(0,0,0,0.25)',
          }}
        />
      ) : null}

      {/* Solid panel — backdrop-filter creates a glassy surface that adapts
          to whatever's behind it. The blur smears the bg pixels into a
          uniform mid-tone, so a fixed-alpha dark fill reads predictably
          against any AI / gradient / phone-edge background. */}
      <div
        style={{
          position: 'absolute',
          top: '34.4cqh',
          left: '7.5cqw',
          width: '85cqw',
          height: '46.9cqh',
          borderRadius: '5.6cqw',
          background: 'rgba(0,0,0,calc(0.55 + var(--scrim-boost, 0)))',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          padding: '4cqh 4cqw',
          gap: '2cqh',
        }}
      >
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(72px, 7.0cqh, 180px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 900,
            color: headlineColor,
            textAlign: 'center',
            textWrap: 'balance',
            maxWidth: '14ch',
          }}
        >
          {headlineNodes}
        </div>
        {subheadline ? (
          <div
            data-zone="subheadline"
            style={{
              fontSize: 'var(--text-subheadline)',
              lineHeight: 'var(--leading-subheadline)',
              fontWeight: 500,
              color: subheadColor,
              textAlign: 'center',
              textWrap: 'balance',
              maxWidth: '24ch',
              marginTop: 'auto',
              marginBottom: '0',
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      {/* Chip row — flex pills, last chip in accent. Wraps if there are too
          many to fit one row at the canvas-width minimum (gap=2cqw guarantees
          breathing room). */}
      {chips.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            top: '83cqh',
            left: 0,
            right: 0,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '2cqw',
            padding: '0 4cqw',
          }}
        >
          {chips.slice(0, 4).map((c, i, arr) => {
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
                  letterSpacing: '0.01em',
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export async function heroType(input: LayoutInput): Promise<LayoutResult> {
  const iconPath = path.join(input.projectRoot, input.config.app.icon);
  const headlineNodes = renderHeadline(input.screenshot.headline, input.theme.accent);

  return renderAndCapture(
    <HeroView
      bgUrl={bufferToDataUri(input.background)}
      iconUrl={iconToDataUri(iconPath)}
      headlineNodes={headlineNodes}
      subheadline={input.screenshot.subheadline}
      chips={(input.screenshot.features ?? []).slice(0, 4).filter(Boolean)}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
      accent={input.theme.accent}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
