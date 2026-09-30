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

export function clampFrame(f: FrameV1): FrameV1 {
  const w = Math.min(0.98, Math.max(0.04, f.w));
  const h = Math.min(0.98, Math.max(0.04, f.h));
  const x = Math.min(1 - w, Math.max(0, f.x));
  const y = Math.min(1 - h, Math.max(0, f.y));
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
  const mw = Math.max(1, meta?.width ?? 9);
  const mh = Math.max(1, meta?.height ?? 16);
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
  return centerFrame({ x: 0, y: 0, w, h });
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
