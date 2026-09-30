/**
 * REBUILD 14 P4 — Shared Intro geometry (9:16).
 * Re-export product geometry SSOT; no platform-specific crop/stretch.
 */

export {
  BASE_COMPOSITION_ASPECT,
  type FrameV1,
} from "@/lib/intro/contracts/document";

export {
  centerFrame,
  centerX,
  centerY,
  clampFrame,
  containMediaFrame,
  defaultImageInsertFrame,
  defaultLogoInsertFrame,
  DEFAULT_LOGO_MAX_H,
  DEFAULT_LOGO_MAX_W,
  DEFAULT_MEDIA_MAX_H,
  DEFAULT_MEDIA_MAX_W,
  roundNorm,
  type MediaSize,
} from "@/lib/intro/geometry/element-layout";

/** Default IMAGE/LOGO fit for authored frames when unspecified. */
export const DEFAULT_ELEMENT_FIT = "CONTAIN" as const;

/**
 * Center formula for explicit center operation:
 * x = (1 - w) / 2
 * y = (1 - h) / 2
 */
export function centerNormalizedFrame(w: number, h: number): {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
} {
  return {
    x: (1 - w) / 2,
    y: (1 - h) / 2,
    w,
    h,
  };
}

export function isNormalizedFrameInRange(frame: {
  x: number;
  y: number;
  w: number;
  h: number;
}): boolean {
  if (![frame.x, frame.y, frame.w, frame.h].every((n) => Number.isFinite(n))) {
    return false;
  }
  if (frame.w < 0.01 || frame.h < 0.01) return false;
  if (frame.x < 0 || frame.y < 0) return false;
  if (frame.x + frame.w > 1.001 || frame.y + frame.h > 1.001) return false;
  return true;
}
