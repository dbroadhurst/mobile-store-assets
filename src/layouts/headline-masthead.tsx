import * as React from 'react';
import fs from 'fs';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { cssAspectRatio } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// HEADLINE MASTHEAD
// Top headline panel + optional eyebrow chip, phone fills the bottom. The
// glassy panel uses backdrop-filter so the left-aligned headline stays
// readable against any background. Eyebrow chip is the spec's
// `badge_label` (e.g. "NEW", "BETA") rendered in the accent colour.

function fileToDataUri(p: string): string {
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}

function bufferToDataUri(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

interface MastheadViewProps {
  bgUrl: string;
  screenshotUrl: string;
  screenshotAspect: string;
  headline: string;
  eyebrow: string;
  headlineColor: string;
  accent: string;
}

function MastheadView({
  bgUrl, screenshotUrl, screenshotAspect, headline, eyebrow, headlineColor, accent,
}: MastheadViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Panel — top portion of canvas. The backdrop-filter blur keeps the
          left-aligned headline readable regardless of bg pixels. */}
      <div
        style={{
          position: 'absolute',
          top: '5.6cqh',
          left: '6.25cqw',
          width: '87.5cqw',
          height: '25.9cqh',
          borderRadius: '5.6cqw',
          background: 'rgba(10,15,31,calc(0.62 + var(--scrim-boost, 0)))',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          padding: '3cqh 4cqw',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '1.5cqh',
        }}
      >
        {eyebrow ? (
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
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(64px, 5.8cqh, 150px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 900,
            color: headlineColor,
            textAlign: 'left',
            textWrap: 'balance',
          }}
        >
          {headline}
        </div>
      </div>

      {/* Phone — bottom portion. Centered horizontally, height-constrained so
          it never overlaps the panel above. */}
      <div
        style={{
          position: 'absolute',
          top: '35cqh',
          left: 0,
          right: 0,
          bottom: '4cqh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingInline: '10cqw',
        }}
      >
        <img
          src={screenshotUrl}
          alt=""
          style={{
            height: '100%',
            maxWidth: '100%',
            aspectRatio: screenshotAspect,
            objectFit: 'cover',
            borderRadius: '5cqw',
            boxShadow: '0 3cqh 8cqh rgba(0,0,0,0.30), 0 0 0 1cqw rgba(0,0,0,0.20)',
          }}
        />
      </div>
    </div>
  );
}

export async function headlineMasthead(input: LayoutInput): Promise<LayoutResult> {
  if (!input.screenshotPath) {
    throw new Error('headline-masthead requires a screenshot source');
  }

  return renderAndCapture(
    <MastheadView
      bgUrl={bufferToDataUri(input.background)}
      screenshotUrl={fileToDataUri(input.screenshotPath)}
      screenshotAspect={cssAspectRatio(input.screenshotAspectRatio)}
      headline={stripBrackets(input.screenshot.headline)}
      eyebrow={input.screenshot.badge_label ?? ''}
      headlineColor={input.theme.headline_color}
      accent={input.theme.accent}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
