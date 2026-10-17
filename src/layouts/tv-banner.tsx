import * as React from 'react';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import { fileToDataUriOrNull, bufferToDataUri } from './shared.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// ANDROID TV BANNER — 1280×720, 16:9
// Required for Android TV listings. Composed from app icon (left, rounded-rect
// — TV banners want square-with-rounded-corners, not full circle) + app name
// + tagline.

interface TvBannerViewProps {
  bgUrl: string;
  iconUrl: string | null;
  appName: string;
  tagline: string;
  headlineColor: string;
  subheadColor: string;
}

function TvBannerView({
  bgUrl, iconUrl, appName, tagline, headlineColor, subheadColor,
}: TvBannerViewProps) {
  return (
    <div
      className="canvas-root"
      style={{
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4cqw',
        gap: '4cqw',
      }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          style={{
            height: '62cqh',
            aspectRatio: 1,
            borderRadius: '14%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : null}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2cqh' }}>
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(56px, 24cqh, 200px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 800,
            color: headlineColor,
          }}
        >
          {appName}
        </div>
        {tagline ? (
          <div
            data-zone="subheadline"
            style={{
              fontSize: 'clamp(20px, 10cqh, 80px)',
              fontWeight: 400,
              color: subheadColor,
            }}
          >
            {tagline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function tvBanner(input: LayoutInput): Promise<LayoutResult> {
  const iconPath = path.join(input.projectRoot, input.config.app.icon);
  return renderAndCapture(
    <TvBannerView
      bgUrl={bufferToDataUri(input.background)}
      iconUrl={fileToDataUriOrNull(iconPath)}
      appName={input.config.app.name}
      tagline={input.screenshot.subheadline ?? ''}
      headlineColor={input.theme.headline_color}
      subheadColor={input.theme.subheadline_color}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
