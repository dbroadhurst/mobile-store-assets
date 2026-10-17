import * as React from 'react';
import fs from 'fs';
import path from 'path';
import { renderAndCapture } from '../render/capture.js';
import { stripBrackets } from '../helpers.js';
import type { LayoutInput, LayoutResult } from '../types.js';

// FEATURE STACK
// No phone. App icon + 2-line title + 4 numbered feature rows + optional
// footer chip. Pure-CSS layout.
//
// Feature format: each entry in `features[]` is "Label — body text"; the
// em/en-dash splits label from body. Last row gets accent treatment with a
// ★ badge instead of a number.

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

interface Row {
  label: string;
  body: string;
  isAccent: boolean;
  badgeText: string;
}

function splitFeatures(features: string[]): Row[] {
  const trimmed = features.slice(0, 4).filter(Boolean);
  return trimmed.map((raw, i) => {
    const [labelRaw, ...bodyParts] = raw.split(/\s*[—–-]\s*/);
    const isAccent = i === trimmed.length - 1 && trimmed.length > 1;
    return {
      label: labelRaw.trim(),
      body: bodyParts.join(' — ').trim(),
      isAccent,
      badgeText: isAccent ? '★' : String(i + 1),
    };
  });
}

interface FeatureStackViewProps {
  bgUrl: string;
  iconUrl: string | null;
  title: string;
  rows: Row[];
  footerText: string;
  headlineColor: string;
  accent: string;
}

function FeatureStackView({
  bgUrl, iconUrl, title, rows, footerText, headlineColor, accent,
}: FeatureStackViewProps) {
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
        padding: '4cqh 6.25cqw',
        gap: '2cqh',
      }}
    >
      {/* Icon — circular, ~21% canvas width, top-anchored */}
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          style={{
            width: '21.2cqw',
            height: '21.2cqw',
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: '0 2cqh 5cqh rgba(0,0,0,0.25)',
            marginTop: '2cqh',
          }}
        />
      ) : null}

      {/* Title — glassy panel with centered headline */}
      <div
        style={{
          width: '100%',
          padding: '2cqh 4cqw',
          borderRadius: '4.4cqw',
          background: 'rgba(10,15,31,calc(0.55 + var(--scrim-boost, 0)))',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          data-zone="headline"
          style={{
            fontSize: 'clamp(56px, 4.5cqh, 110px)',
            lineHeight: 1.13,
            letterSpacing: '-0.015em',
            fontWeight: 900,
            color: headlineColor,
            textAlign: 'center',
            textWrap: 'balance',
            maxWidth: '20ch',
          }}
        >
          {title}
        </div>
      </div>

      {/* Feature rows — flex column, last row uses accent */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5cqh',
          marginTop: '1cqh',
        }}
      >
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              borderRadius: '4.4cqw',
              padding: '2.2cqh 3.5cqw',
              background: r.isAccent ? accent : 'rgba(10,15,31,calc(0.55 + var(--scrim-boost, 0)))',
              backdropFilter: r.isAccent ? undefined : 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: r.isAccent ? undefined : 'blur(20px) saturate(160%)',
              display: 'flex',
              alignItems: 'center',
              gap: '3cqw',
              minHeight: '11.9cqh',
            }}
          >
            {/* Badge — circle with number or star */}
            <div
              style={{
                flexShrink: 0,
                width: '11cqw',
                height: '11cqw',
                borderRadius: '50%',
                background: r.isAccent ? '#1A2330' : accent,
                color: r.isAccent ? accent : '#1A2330',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(36px, 5cqh, 90px)',
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {r.badgeText}
            </div>
            {/* Text column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4cqh' }}>
              <div
                data-zone="label"
                style={{
                  fontSize: 'clamp(34px, 2.7cqh, 64px)',
                  fontWeight: 800,
                  letterSpacing: '-0.005em',
                  color: r.isAccent ? '#1A2330' : headlineColor,
                  lineHeight: 1.1,
                }}
              >
                {r.label}
              </div>
              {r.body ? (
                <div
                  data-zone="caption"
                  style={{
                    fontSize: 'clamp(24px, 2.0cqh, 48px)',
                    fontWeight: 500,
                    color: r.isAccent ? 'rgba(26,35,48,0.82)' : 'rgba(255,255,255,0.82)',
                    lineHeight: 1.3,
                  }}
                >
                  {r.body}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Footer chip — pushes to bottom via marginTop: auto */}
      {footerText ? (
        <div
          data-zone="badge"
          style={{
            marginTop: 'auto',
            padding: '1cqh 4cqw',
            borderRadius: '9999px',
            background: 'rgba(255,255,255,0.94)',
            color: '#1E2A4A',
            fontSize: 'var(--text-badge)',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {footerText}
        </div>
      ) : null}
    </div>
  );
}

export async function featureStack(input: LayoutInput): Promise<LayoutResult> {
  const iconPath = path.join(input.projectRoot, input.config.app.icon);
  const rows = splitFeatures(input.screenshot.features ?? []);
  const footerText = input.screenshot.badge_label
    ? `${input.screenshot.badge_count ?? ''} ${input.screenshot.badge_label}`.trim()
    : '';

  return renderAndCapture(
    <FeatureStackView
      bgUrl={bufferToDataUri(input.background)}
      iconUrl={iconToDataUri(iconPath)}
      title={stripBrackets(input.screenshot.headline)}
      rows={rows}
      footerText={footerText}
      headlineColor={input.theme.headline_color}
      accent={input.theme.accent}
    />,
    { width: input.targetWidth, height: input.targetHeight, scrimBoost: input.scrimBoost },
  );
}
