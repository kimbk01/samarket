/**
 * Element geometry SSOT — center / contain for Admin + Preview + Native semantics.
 */

export type FrameV1 = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type MediaSize = {
  readonly width: number;
  readonly height: number;
};

/** Max fractions of 9:16 composition for auto-inserted media. */
export const DEFAULT_MEDIA_MAX_W = 0.82;
export const DEFAULT_MEDIA_MAX_H = 0.55;
export const DEFAULT_LOGO_MAX_W = 0.42;
export const DEFAULT_LOGO_MAX_H = 0.18;

/** Stable norm fractions for document + seal (avoid binary float noise in JSON). */
export function roundNorm(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e8) / 1e8;
}

export function clampFrame(f: FrameV1): FrameV1 {
  const w = roundNorm(Math.min(0.98, Math.max(0.04, f.w)));
  const h = roundNorm(Math.min(0.98, Math.max(0.04, f.h)));
  const x = roundNorm(Math.min(1 - w, Math.max(0, f.x)));
  const y = roundNorm(Math.min(1 - h, Math.max(0, f.y)));
  return { x, y, w, h };
}

export function centerX(frame: FrameV1): FrameV1 {
  return clampFrame({ ...frame, x: (1 - frame.w) / 2 });
}

export function centerY(frame: FrameV1): FrameV1 {
  return clampFrame({ ...frame, y: (1 - frame.h) / 2 });
}

export function centerFrame(frame: FrameV1): FrameV1 {
  return centerY(centerX(frame));
}

/**
 * CONTAIN media into max box, preserve aspect, center in composition.
 */
export function containMediaFrame(
  meta: MediaSize | null | undefined,
  maxW = DEFAULT_MEDIA_MAX_W,
  maxH = DEFAULT_MEDIA_MAX_H,
): FrameV1 {
  // Intrinsic required for Operator insert SSOT — null meta must not invent square 1:1.
  const mw = meta?.width;
  const mh = meta?.height;
  if (!mw || !mh || mw < 1 || mh < 1) {
    // Fail-closed placeholder: thin centered slot (not 0.55×0.55 square).
    return centerFrame({ x: 0, y: 0, w: roundNorm(maxW * 0.5), h: roundNorm(maxH * 0.35) });
  }
  const aspect = mw / mh;
  const boxAspect = maxW / maxH;
  let w: number;
  let h: number;
  if (aspect > boxAspect) {
    w = maxW;
    h = maxW / aspect;
  } else {
    h = maxH;
    w = maxH * aspect;
  }
  return centerFrame({ x: 0, y: 0, w: roundNorm(w), h: roundNorm(h) });
}

export function defaultImageInsertFrame(meta?: MediaSize | null): FrameV1 {
  return containMediaFrame(meta, DEFAULT_MEDIA_MAX_W, DEFAULT_MEDIA_MAX_H);
}

export function defaultLogoInsertFrame(meta?: MediaSize | null): FrameV1 {
  return containMediaFrame(meta, DEFAULT_LOGO_MAX_W, DEFAULT_LOGO_MAX_H);
}

export function defaultVideoInsertFrame(meta?: MediaSize | null): FrameV1 {
  return containMediaFrame(meta, DEFAULT_MEDIA_MAX_W, DEFAULT_MEDIA_MAX_H);
}
