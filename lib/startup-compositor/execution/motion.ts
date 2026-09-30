/**
 * REBUILD 14 P5 — Canonical element motion execution semantics.
 *
 * Shared progress ∈ [0,1] → semantic opacity / translateNorm / scale.
 * Platform renderers map later; CSS/UIKit/Android values are NOT SSOT.
 */

import {
  isMotionTypeV1,
  normalizeMotionV1,
  type MotionTypeV1,
  type MotionV1,
} from "@/lib/startup-compositor/registries/motion";
import type { AuthorityClassification } from "@/lib/startup-compositor/execution/geometry";

export type SemanticMotionState = {
  readonly type: MotionTypeV1;
  readonly progress: number;
  readonly opacity: number;
  /** Translate as fraction of element frame width (X) / height (Y). */
  readonly translateXNorm: number;
  readonly translateYNorm: number;
  readonly scale: number;
  readonly complete: boolean;
};

/**
 * Enter distance in element-local normalized space (1.0 = full element size off-screen).
 * Source: IMPLEMENTATION_CHOICE (not Owner-locked; required for deterministic execution).
 */
export const MOTION_ENTER_DISTANCE_NORM = 1.0 as const;
export const MOTION_ENTER_DISTANCE_CLASSIFICATION: AuthorityClassification =
  "IMPLEMENTATION_CHOICE";

/**
 * SCALE_IN initial scale.
 * Source: IMPLEMENTATION_CHOICE.
 */
export const MOTION_SCALE_IN_INITIAL = 0.85 as const;
export const MOTION_SCALE_IN_CLASSIFICATION: AuthorityClassification =
  "IMPLEMENTATION_CHOICE";

/**
 * Easing applied to semantic progress before transform mapping.
 * LINEAR = identity. Source: IMPLEMENTATION_CHOICE (no CSS easing as SSOT).
 */
export const MOTION_EASING = "LINEAR" as const;
export const MOTION_EASING_CLASSIFICATION: AuthorityClassification =
  "IMPLEMENTATION_CHOICE";

export function clampUnit(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress < 0) return 0;
  if (progress > 1) return 1;
  return progress;
}

/** LINEAR easing — semantic identity. */
export function applyMotionEasing(progress: number): number {
  return clampUnit(progress);
}

/**
 * Local motion progress from scene-visible elapsed.
 * T0 = scene visibility clock (not view attach / decode / layout).
 */
export function motionLocalProgress(args: {
  readonly sceneElapsedMs: number;
  readonly startMs: number;
  readonly durationMs: number;
}): number {
  const { sceneElapsedMs, startMs, durationMs } = args;
  if (!Number.isFinite(sceneElapsedMs) || !Number.isFinite(startMs)) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return clampUnit((sceneElapsedMs - startMs) / durationMs);
}

export function evaluateMotionProgress(
  motion: MotionV1 | { readonly type: string; readonly startMs?: number; readonly durationMs?: number },
  progressRaw: number,
):
  | { readonly ok: true; readonly value: SemanticMotionState }
  | { readonly ok: false; readonly reason: string } {
  const normalized = normalizeMotionV1(motion);
  if (!normalized) {
    const t = (motion as { type?: unknown }).type;
    if (typeof t === "string" && t.startsWith("SLIDE_")) {
      return { ok: false, reason: "motion_transition_token_forbidden" };
    }
    return { ok: false, reason: "motion_unsupported" };
  }
  if (!isMotionTypeV1(normalized.type)) {
    return { ok: false, reason: "motion_unsupported" };
  }

  const progress = applyMotionEasing(progressRaw);
  const complete = progress >= 1;

  if (normalized.type === "NONE") {
    return {
      ok: true,
      value: {
        type: "NONE",
        progress: 1,
        opacity: 1,
        translateXNorm: 0,
        translateYNorm: 0,
        scale: 1,
        complete: true,
      },
    };
  }

  const inv = 1 - progress;
  const d = MOTION_ENTER_DISTANCE_NORM;

  switch (normalized.type) {
    case "FADE_IN":
      return {
        ok: true,
        value: {
          type: "FADE_IN",
          progress,
          opacity: progress,
          translateXNorm: 0,
          translateYNorm: 0,
          scale: 1,
          complete,
        },
      };
    case "ENTER_LEFT":
      return {
        ok: true,
        value: {
          type: "ENTER_LEFT",
          progress,
          opacity: 1,
          translateXNorm: -inv * d,
          translateYNorm: 0,
          scale: 1,
          complete,
        },
      };
    case "ENTER_RIGHT":
      return {
        ok: true,
        value: {
          type: "ENTER_RIGHT",
          progress,
          opacity: 1,
          translateXNorm: inv * d,
          translateYNorm: 0,
          scale: 1,
          complete,
        },
      };
    case "ENTER_UP":
      return {
        ok: true,
        value: {
          type: "ENTER_UP",
          progress,
          opacity: 1,
          translateXNorm: 0,
          translateYNorm: -inv * d,
          scale: 1,
          complete,
        },
      };
    case "ENTER_DOWN":
      return {
        ok: true,
        value: {
          type: "ENTER_DOWN",
          progress,
          opacity: 1,
          translateXNorm: 0,
          translateYNorm: inv * d,
          scale: 1,
          complete,
        },
      };
    case "SCALE_IN": {
      const s0 = MOTION_SCALE_IN_INITIAL;
      const scale = s0 + (1 - s0) * progress;
      return {
        ok: true,
        value: {
          type: "SCALE_IN",
          progress,
          opacity: 1,
          translateXNorm: 0,
          translateYNorm: 0,
          scale,
          complete,
        },
      };
    }
    default:
      return { ok: false, reason: "motion_unsupported" };
  }
}

/**
 * Evaluate motion at scene elapsed (clock must already exclude hidden time).
 */
export function evaluateMotionAtSceneElapsed(
  motion: MotionV1,
  sceneElapsedMs: number,
):
  | { readonly ok: true; readonly value: SemanticMotionState }
  | { readonly ok: false; readonly reason: string } {
  const p = motionLocalProgress({
    sceneElapsedMs,
    startMs: motion.startMs,
    durationMs: motion.durationMs,
  });
  return evaluateMotionProgress(motion, p);
}
