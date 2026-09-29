/**
 * Geometry SSOT — 9:16 authored composition fitted into device viewport.
 * Same algorithm for Admin Preview / Android / iOS.
 */

export type ContentRegion = {
  readonly OX: number;
  readonly OY: number;
  readonly RW: number;
  readonly RH: number;
};

export type DeviceRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** Letterbox FIT: entire 9:16 composition visible; no crop. */
export function fitContentRegion(
  viewportW: number,
  viewportH: number,
  aspectW: number,
  aspectH: number,
): ContentRegion {
  const VW = Math.max(1, viewportW);
  const VH = Math.max(1, viewportH);
  const target = aspectW / aspectH;
  const view = VW / VH;
  let RW: number;
  let RH: number;
  if (view > target) {
    RH = VH;
    RW = VH * target;
  } else {
    RW = VW;
    RH = VW / target;
  }
  return {
    OX: (VW - RW) / 2,
    OY: (VH - RH) / 2,
    RW,
    RH,
  };
}

export function mapFrame(
  frame: { x: number; y: number; w: number; h: number },
  region: ContentRegion,
): DeviceRect {
  return {
    left: region.OX + frame.x * region.RW,
    top: region.OY + frame.y * region.RH,
    width: frame.w * region.RW,
    height: frame.h * region.RH,
  };
}
