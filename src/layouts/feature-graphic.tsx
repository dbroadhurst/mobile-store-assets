import * as React from 'react';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import { fileToDataUri, bufferToDataUri } from './shared.js';
import type { Theme, LayoutResult } from '../types.js';

// FEATURE GRAPHIC
// Google Play's 1024×500 banner shown above an app on its listing page. Port
// of the inline buildFeatureGraphic() that used to live in index.ts.
//
// Three variants are rotated per matrix set (setIndex % 3):
//   banner-bottom — three phones across upper 70%, scrim band at bottom
//   hero-right    — one large hero phone right + two flanking smaller phones,
//                   text panel on the left
//   cluster-left  — two overlapping phones on the left, text panel on the right
//
// Self-contained adaptive scrim (the layout reads theme.headline_color and
// flips panel fill to white-on-dark-text or dark-on-light-text). Feature
// graphics don't go through the contrast gate — Play would reject any
// transparent alpha in the final PNG anyway, so the wrapper post-processes
// with sharp.removeAlpha().

const SAFE_PX = 60;

export type FeatureGraphicVariant = 'banner-bottom' | 'hero-right' | 'cluster-left';

export const FEATURE_GRAPHIC_VARIANTS: readonly FeatureGraphicVariant[] = [
  'banner-bottom',
  'hero-right',
  'cluster-left',
] as const;

export interface FeatureGraphicInput {
  background: Buffer;
  /** Up to 3 resolved phone screenshot paths (first is the value/hero slot). */
  phonePaths: string[];
  headline: string;
  subline: string;
  theme: Theme;
  variant: FeatureGraphicVariant;
  width: number;
  height: number;
}

function isLightHex(hex: string): boolean {
  // Relative luminance check (Rec. 601 weights). Mirrors the helper that used
  // to live in index.ts. Anything outside hex falls through as "light" so the
  // panel defaults to dark scrim.
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    const short = /^#([0-9a-f]{3})$/i.exec(hex);
    if (!short) return true;
    const r = parseInt(short[1][0] + short[1][0], 16);
    const g = parseInt(short[1][1] + short[1][1], 16);
    const b = parseInt(short[1][2] + short[1][2], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  }
  const r = parseInt(m[1].substring(0, 2), 16);
  const g = parseInt(m[1].substring(2, 4), 16);
  const b = parseInt(m[1].substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

function scrimFor(theme: Theme): { fill: string; opacity: number } {
  const lightText = isLightHex(theme.headline_color);
  return lightText
    ? { fill: '#0A0A0F', opacity: 0.58 }
    : { fill: '#FFFFFF', opacity: 0.72 };
}

// ─── Variant: banner-bottom ────────────────────────────────────────────────
// Three phones fanned across the upper canvas, scrim band at the bottom
// holding centred headline + subline.

function BannerBottomView(props: {
  bgUrl: string; phoneUrls: string[]; headline: string; subline: string; theme: Theme;
}) {
  const { bgUrl, phoneUrls, headline, subline, theme } = props;
  const scrim = scrimFor(theme);
  const tilts = phoneUrls.length === 1 ? [-6]
              : phoneUrls.length === 2 ? [-8, 8]
              : [-9, 0, 9];
  const scales = phoneUrls.length === 1 ? [1]
               : phoneUrls.length === 2 ? [0.85, 0.85]
               : [0.85, 0.95, 0.85];
  const scrimRgb = scrim.fill === '#0A0A0F' ? '10,10,15' : '255,255,255';

  // Sizing math for the fixed 1024×500 canvas:
  //   band height = 46% of 500 = 230px
  //   - padding 18px top + 22px bottom + 12px gap = 52px chrome
  //   - headline at clamp max 46px × 1.08 × 2 lines ≈ 100px
  //   - subline at clamp max 22px × 1.3 ≈ 29px
  //   total text+chrome ≈ 181px, fits 230px with margin.
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Phones — top half. Bleed off the top for energy; bottoms sit just
          inside the band's feathered edge so they feel anchored, not
          floating. */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: 0,
          right: 0,
          height: '70%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-evenly',
          paddingInline: '4%',
        }}
      >
        {phoneUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt=""
            style={{
              height: `${70 * scales[i]}%`,
              aspectRatio: '9 / 19.5',
              objectFit: 'cover',
              transform: `rotate(${tilts[i]}deg)`,
              transformOrigin: 'center bottom',
              borderRadius: '2.5%',
              boxShadow: '0 12px 22px rgba(0,0,0,0.30)',
            }}
          />
        ))}
      </div>

      {/* Bottom scrim band — feathered top edge, centred text. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '46%',
          padding: '18px 6% 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '12px',
          background:
            `linear-gradient(180deg, ` +
            `rgba(${scrimRgb},0) 0%, ` +
            `rgba(${scrimRgb},${scrim.opacity}) 28%, ` +
            `rgba(${scrimRgb},${scrim.opacity}) 100%)`,
        }}
      >
        <div
          style={{
            fontSize: 'clamp(26px, 9cqh, 46px)',
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            fontWeight: 800,
            color: theme.headline_color,
            textWrap: 'balance',
            maxWidth: '26ch',
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              fontSize: 'clamp(13px, 4.4cqh, 22px)',
              lineHeight: 1.3,
              fontWeight: 400,
              color: theme.subheadline_color,
              textWrap: 'balance',
              maxWidth: '48ch',
            }}
          >
            {subline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Variant: hero-right ───────────────────────────────────────────────────
// One large hero phone right-of-centre, flanked by two smaller phones, text
// panel on the left.

function HeroRightView(props: {
  bgUrl: string; phoneUrls: string[]; headline: string; subline: string; theme: Theme;
}) {
  const { bgUrl, phoneUrls, headline, subline, theme } = props;
  const scrim = scrimFor(theme);
  const hero = phoneUrls[0];
  const flankA = phoneUrls[1];
  const flankB = phoneUrls[2];

  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Flanking phones (behind the hero) */}
      {flankA ? (
        <img
          src={flankA}
          alt=""
          style={{
            position: 'absolute',
            top: '5cqh',
            left: '78cqw',
            height: '90cqh',
            aspectRatio: '9 / 19.5',
            objectFit: 'cover',
            transform: 'translateX(-50%) rotate(12deg)',
            borderRadius: '2.5cqw',
            boxShadow: '0 3cqh 6cqh rgba(0,0,0,0.25)',
          }}
        />
      ) : null}
      {flankB ? (
        <img
          src={flankB}
          alt=""
          style={{
            position: 'absolute',
            top: '8cqh',
            left: '60cqw',
            height: '82cqh',
            aspectRatio: '9 / 19.5',
            objectFit: 'cover',
            transform: 'translateX(-50%) rotate(-10deg)',
            borderRadius: '2.5cqw',
            boxShadow: '0 3cqh 6cqh rgba(0,0,0,0.25)',
          }}
        />
      ) : null}
      {/* Hero phone (front, slight left tilt) */}
      {hero ? (
        <img
          src={hero}
          alt=""
          style={{
            position: 'absolute',
            top: '-5cqh',
            left: '74cqw',
            height: '110cqh',
            aspectRatio: '9 / 19.5',
            objectFit: 'cover',
            transform: 'translateX(-50%) rotate(-4deg)',
            borderRadius: '2.5cqw',
            boxShadow: '0 4cqh 9cqh rgba(0,0,0,0.35)',
          }}
        />
      ) : null}

      {/* Text panel on the left */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: `${SAFE_PX}px`,
          width: '48cqw',
          padding: '6cqh 3cqw',
          borderRadius: '3cqw',
          background: `${scrim.fill === '#0A0A0F'
            ? `rgba(10,10,15,${scrim.opacity})`
            : `rgba(255,255,255,${scrim.opacity})`}`,
          boxShadow: '0 8px 28px rgba(0,0,0,0.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3cqh',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(28px, 16cqh, 88px)',
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            fontWeight: 800,
            color: theme.headline_color,
            textWrap: 'balance',
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              fontSize: 'clamp(14px, 5.5cqh, 30px)',
              lineHeight: 1.3,
              fontWeight: 400,
              color: theme.subheadline_color,
              textWrap: 'balance',
            }}
          >
            {subline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Variant: cluster-left ─────────────────────────────────────────────────
// Two overlapping phones on the left, text panel on the right (slightly
// below centre for visual asymmetry).

function ClusterLeftView(props: {
  bgUrl: string; phoneUrls: string[]; headline: string; subline: string; theme: Theme;
}) {
  const { bgUrl, phoneUrls, headline, subline, theme } = props;
  const scrim = scrimFor(theme);
  const front = phoneUrls[0];
  const back = phoneUrls[1];

  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {back ? (
        <img
          src={back}
          alt=""
          style={{
            position: 'absolute',
            top: '0',
            left: '36cqw',
            height: '92cqh',
            aspectRatio: '9 / 19.5',
            objectFit: 'cover',
            transform: 'translateX(-50%) rotate(8deg)',
            borderRadius: '2.5cqw',
            boxShadow: '0 4cqh 8cqh rgba(0,0,0,0.30)',
          }}
        />
      ) : null}
      {front ? (
        <img
          src={front}
          alt=""
          style={{
            position: 'absolute',
            top: '-3cqh',
            left: '22cqw',
            height: '106cqh',
            aspectRatio: '9 / 19.5',
            objectFit: 'cover',
            transform: 'translateX(-50%) rotate(-6deg)',
            borderRadius: '2.5cqw',
            boxShadow: '0 4cqh 9cqh rgba(0,0,0,0.35)',
          }}
        />
      ) : null}

      <div
        style={{
          position: 'absolute',
          top: '58%',
          transform: 'translateY(-50%)',
          right: `${SAFE_PX}px`,
          width: '48cqw',
          padding: '6cqh 3cqw',
          borderRadius: '3cqw',
          background: `${scrim.fill === '#0A0A0F'
            ? `rgba(10,10,15,${scrim.opacity})`
            : `rgba(255,255,255,${scrim.opacity})`}`,
          boxShadow: '0 8px 28px rgba(0,0,0,0.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3cqh',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(28px, 16cqh, 88px)',
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            fontWeight: 800,
            color: theme.headline_color,
            textWrap: 'balance',
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              fontSize: 'clamp(14px, 5.5cqh, 30px)',
              lineHeight: 1.3,
              fontWeight: 400,
              color: theme.subheadline_color,
              textWrap: 'balance',
            }}
          >
            {subline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function featureGraphic(input: FeatureGraphicInput): Promise<LayoutResult> {
  const bgUrl = bufferToDataUri(input.background);
  const phoneUrls = input.phonePaths.slice(0, 3).map(p => fileToDataUri(p));
  const headline = stripBrackets(input.headline);

  const view = input.variant === 'banner-bottom'
    ? <BannerBottomView bgUrl={bgUrl} phoneUrls={phoneUrls} headline={headline} subline={input.subline} theme={input.theme} />
    : input.variant === 'hero-right'
    ? <HeroRightView   bgUrl={bgUrl} phoneUrls={phoneUrls} headline={headline} subline={input.subline} theme={input.theme} />
    : <ClusterLeftView bgUrl={bgUrl} phoneUrls={phoneUrls} headline={headline} subline={input.subline} theme={input.theme} />;

  return renderAndCapture(view, { width: input.width, height: input.height });
}
