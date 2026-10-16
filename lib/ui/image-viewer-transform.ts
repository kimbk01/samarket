/**
 * Full-screen image viewer — zoom / pan / swipe math (pure; unit-tested).
 * The component only feeds pointer positions in and applies the returned transform.
 *
 * Gesture contract (no conflicts):
 * - scale ≈ 1 : horizontal drag pages between images, downward drag dismisses, axis locks after SLOP px.
 * - scale > 1 : one-finger drag only pans the image (clamped to its edges); it never pages or dismisses.
 *   Zoom out (pinch / double tap) to page again.
 * - two fingers : pinch zoom around the fingers' midpoint, always.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const SLOP_PX = 8;
export const DOUBLE_TAP_MS = 280;
export const DOUBLE_TAP_SLOP_PX = 24;

export type ViewTransform = { scale: number; x: number; y: number };
export type Size = { w: number; h: number };

export const IDENTITY: ViewTransform = { scale: 1, x: 0, y: 0 };

export function isZoomed(t: ViewTransform): boolean {
  return t.scale > 1.01;
}

/** Image box when fitted (object-contain) inside the stage. */
export function fitSize(natural: Size, stage: Size): Size {
  if (natural.w <= 0 || natural.h <= 0 || stage.w <= 0 || stage.h <= 0) return { w: stage.w, h: stage.h };
  const r = Math.min(stage.w / natural.w, stage.h / natural.h);
  return { w: natural.w * r, h: natural.h * r };
}

function clampAxis(offset: number, fitted: number, stage: number, scale: number): number {
  const overflow = Math.max(0, (fitted * scale - stage) / 2);
  return Math.min(overflow, Math.max(-overflow, offset));
}

/** Keep the zoomed image covering the stage — no panning past its edges. */
export function clampTransform(t: ViewTransform, fitted: Size, stage: Size): ViewTransform {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale));
  if (scale <= 1.01) return { ...IDENTITY };
  return { scale, x: clampAxis(t.x, fitted.w, stage.w, scale), y: clampAxis(t.y, fitted.h, stage.h, scale) };
}

/**
 * Zoom to `nextScale` keeping the stage point `focal` (relative to the stage centre) under the finger.
 * Translation is in stage pixels; transform-origin is the image centre.
 */
export function zoomAround(t: ViewTransform, nextScale: number, focal: { x: number; y: number }): ViewTransform {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  const k = s / t.scale;
  return { scale: s, x: focal.x - (focal.x - t.x) * k, y: focal.y - (focal.y - t.y) * k };
}

/** Double tap: fit → zoom in at the tap point · zoomed → back to fit. */
export function doubleTapTarget(t: ViewTransform, focal: { x: number; y: number }, fitted: Size, stage: Size): ViewTransform {
  if (isZoomed(t)) return { ...IDENTITY };
  return clampTransform(zoomAround(t, DOUBLE_TAP_SCALE, focal), fitted, stage);
}

/** "원본" — show the image at its natural pixel size (at least fit, at most MAX_SCALE). */
export function naturalSizeScale(natural: Size, fitted: Size): number {
  if (fitted.w <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(1, natural.w / fitted.w));
}

export type DragAxis = "x" | "y" | null;

export function lockAxis(dx: number, dy: number): DragAxis {
  if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return null;
  return Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
}

/**
 * Release of a horizontal page drag → -1 (previous), +1 (next) or 0 (snap back).
 * Commits past 20% of the width or on a quick flick; never beyond the first/last image.
 */
export function pageDecision(dx: number, velocityX: number, width: number, index: number, count: number): -1 | 0 | 1 {
  const far = Math.abs(dx) > width * 0.2;
  const flick = Math.abs(velocityX) > 0.45 && Math.abs(dx) > 20;
  if (!far && !flick) return 0;
  const dir = dx < 0 ? 1 : -1;
  const next = index + dir;
  if (next < 0 || next >= count) return 0;
  return dir;
}

/** Edge resistance while dragging past the first/last image. */
export function rubberBand(dx: number, index: number, count: number): number {
  if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) return dx * 0.3;
  return dx;
}

/** Release of a downward drag at fit scale → close the viewer. */
export function shouldDismiss(dy: number, velocityY: number): boolean {
  return dy > 120 || (dy > 40 && velocityY > 0.6);
}

export function dismissProgress(dy: number): number {
  return Math.min(1, Math.max(0, dy / 300));
}
