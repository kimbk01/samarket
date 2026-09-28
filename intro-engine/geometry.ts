import type { IntroShowFrame } from "./document";

export type ViewportSize = { width: number; height: number };

export type ProjectedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Normalized 0..1 frame → CSS percent of the full viewport. */
export function projectFrame(frame: IntroShowFrame): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.width * 100}%`,
    height: `${frame.height * 100}%`,
  };
}

export function projectFramePx(frame: IntroShowFrame, viewport: ViewportSize): ProjectedRect {
  return {
    x: frame.x * viewport.width,
    y: frame.y * viewport.height,
    width: frame.width * viewport.width,
    height: frame.height * viewport.height,
  };
}

export function pointerToNormalized(
  clientX: number,
  clientY: number,
  origin: { left: number; top: number },
  viewport: ViewportSize,
): { x: number; y: number } {
  if (viewport.width <= 0 || viewport.height <= 0) return { x: 0, y: 0 };
  return {
    x: (clientX - origin.left) / viewport.width,
    y: (clientY - origin.top) / viewport.height,
  };
}

const MIN_FRAME = 0.04;

export function clampFrame(frame: IntroShowFrame): IntroShowFrame {
  const width = Math.min(1, Math.max(MIN_FRAME, frame.width));
  const height = Math.min(1, Math.max(MIN_FRAME, frame.height));
  const x = Math.min(1 - width, Math.max(0, frame.x));
  const y = Math.min(1 - height, Math.max(0, frame.y));
  return { x, y, width, height };
}

export function moveFrame(frame: IntroShowFrame, dx: number, dy: number): IntroShowFrame {
  return clampFrame({
    x: frame.x + dx,
    y: frame.y + dy,
    width: frame.width,
    height: frame.height,
  });
}

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

/**
 * Corner resize preserving the frame's current aspect ratio.
 * Edge resize is forbidden — it would destroy the authored ratio.
 */
export function resizeFrameAspect(
  frame: IntroShowFrame,
  corner: ResizeCorner,
  pointer: { x: number; y: number },
): IntroShowFrame {
  const aspect = frame.width / Math.max(frame.height, 1e-6);
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  let next: IntroShowFrame;

  if (corner === "se") {
    const width = Math.max(MIN_FRAME, pointer.x - frame.x);
    const height = width / aspect;
    next = { x: frame.x, y: frame.y, width, height };
  } else if (corner === "sw") {
    const width = Math.max(MIN_FRAME, right - pointer.x);
    const height = width / aspect;
    next = { x: right - width, y: frame.y, width, height };
  } else if (corner === "ne") {
    const width = Math.max(MIN_FRAME, pointer.x - frame.x);
    const height = width / aspect;
    next = { x: frame.x, y: bottom - height, width, height };
  } else {
    const width = Math.max(MIN_FRAME, right - pointer.x);
    const height = width / aspect;
    next = { x: right - width, y: bottom - height, width, height };
  }

  return clampFrame(next);
}
