import sharp from 'sharp';

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Phase 5 cleanup left only two helpers in use:
//   - `stripBrackets`  — strips `[bracket]` highlights from a raw headline so
//     layouts that don't use the keyword-highlight convention still render
//     clean text. (Web layouts pass the raw string to `renderWithBrackets`
//     in `src/layouts/shared.tsx` when they want the highlight.)
//   - `screenshotAspect` — reads the height/width ratio of a screenshot file
//     so the dispatcher can auto-detect orientation per screenshot.
//
// The previous text-fit / SVG-overlay helpers (fitText, fitWrapped,
// makeDeviceFrame, escapeXml, TEXT_SHADOW_DEFS, etc.) were removed along
// with the sharp layout pipeline they backed. See git history if you need
// to look any of them up.

/**
 * Strip `[bracket]` highlight markers from a headline, leaving plain text.
 * Used by every layout for the canonical rendered string. Layouts that want
 * to keep the bracket-aware highlight call `renderWithBrackets` in
 * `src/layouts/shared.tsx` directly on the raw string instead.
 */
export function stripBrackets(headline: string): string {
  return headline.replace(/\[([^\]]+)\]/g, '$1');
}

/**
 * Return the screenshot's natural height/width ratio. Used by the dispatcher
 * to auto-detect orientation when the spec doesn't declare one (portrait if
 * h/w ≥ 1, landscape otherwise).
 */
export async function screenshotAspect(screenshotPath: string): Promise<number> {
  const meta = await sharp(screenshotPath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  return h / w;
}
