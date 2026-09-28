/** Full creative surface coordinates. Origin top-left. Range 0–1. Not phone px. Not safe-area. */
export type NormalizedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

const MIN_SPAN = 0.04;

function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeFrame(frame: NormalizedRect): NormalizedRect {
  const w = Math.min(1, Math.max(MIN_SPAN, finite(frame.w, MIN_SPAN)));
  const h = Math.min(1, Math.max(MIN_SPAN, finite(frame.h, MIN_SPAN)));
  const x = Math.min(1 - w, Math.max(0, finite(frame.x, 0)));
  const y = Math.min(1 - h, Math.max(0, finite(frame.y, 0)));
  return { x, y, w, h };
}

export function defaultImageFrame(imageAspect: number, surfaceAspect: number): NormalizedRect {
  const img = imageAspect > 0 ? imageAspect : 1;
  const surface = surfaceAspect > 0 ? surfaceAspect : 1;
  const target = 0.72;
  let w: number;
  let h: number;
  if (img >= surface) {
    w = target;
    h = (target * surface) / img;
  } else {
    h = target;
    w = (target * img) / surface;
  }
  return normalizeFrame({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
}

export function translateFrame(frame: NormalizedRect, dx: number, dy: number): NormalizedRect {
  return normalizeFrame({
    x: frame.x + dx,
    y: frame.y + dy,
    w: frame.w,
    h: frame.h,
  });
}

/** Aspect-ratio-preserving corner resize. `aspect` is w/h of the current frame. */
export function resizeFrameKeepAspect(
  frame: NormalizedRect,
  handle: ResizeHandle,
  dx: number,
  dy: number
): NormalizedRect {
  const aspect = frame.w / Math.max(frame.h, 0.0001);
  const primary = Math.abs(dx) >= Math.abs(dy) ? dx : dy * aspect;
  let nextW = frame.w;
  let nextH = frame.h;
  let nextX = frame.x;
  let nextY = frame.y;

  if (handle === "se") {
    nextW = frame.w + primary;
    nextH = nextW / aspect;
  } else if (handle === "ne") {
    nextW = frame.w + primary;
    nextH = nextW / aspect;
    nextY = frame.y + frame.h - nextH;
  } else if (handle === "sw") {
    nextW = frame.w - primary;
    nextH = nextW / aspect;
    nextX = frame.x + frame.w - nextW;
  } else {
    nextW = frame.w - primary;
    nextH = nextW / aspect;
    nextX = frame.x + frame.w - nextW;
    nextY = frame.y + frame.h - nextH;
  }

  return normalizeFrame({ x: nextX, y: nextY, w: nextW, h: nextH });
}

export function frameStyle(frame: NormalizedRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.w * 100}%`,
    height: `${frame.h * 100}%`,
  };
}
