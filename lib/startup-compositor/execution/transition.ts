/**
 * REBUILD 14 P5 — Canonical scene transition execution semantics.
 *
 * Timing inclusion (EXISTING_PRODUCT_CONTRACT from P4 INTRO_TIMELINE_POLICY):
 * transition duration is ADDITIONAL_TO_SCENE — not included inside scene durationMs.
 */

import {
  isTransitionTypeV1,
  normalizeTransitionV1,
  type TransitionTypeV1,
  type TransitionV1,
} from "@/lib/startup-compositor/registries/transition";
import { isMotionTypeV1 } from "@/lib/startup-compositor/registries/motion";
import { INTRO_TIMELINE_POLICY } from "@/lib/startup-compositor/intro/timeline";
import type { AuthorityClassification } from "@/lib/startup-compositor/execution/geometry";
import { clampUnit } from "@/lib/startup-compositor/execution/motion";

export type TransitionDurationMode = "ADDITIONAL_TO_SCENE" | "INCLUDED_IN_SCENE";

export const TRANSITION_DURATION_MODE: TransitionDurationMode =
  INTRO_TIMELINE_POLICY.transitionDurationMode;

export const TRANSITION_DURATION_MODE_CLASSIFICATION: AuthorityClassification =
  "EXISTING_PRODUCT_CONTRACT";

/**
 * Slide travel in scene-normalized space (1.0 = full composition width/height).
 * Source: IMPLEMENTATION_CHOICE.
 */
export const TRANSITION_SLIDE_DISTANCE_NORM = 1.0 as const;
export const TRANSITION_SLIDE_DISTANCE_CLASSIFICATION: AuthorityClassification =
  "IMPLEMENTATION_CHOICE";

export const TRANSITION_EASING = "LINEAR" as const;
export const TRANSITION_EASING_CLASSIFICATION: AuthorityClassification =
  "IMPLEMENTATION_CHOICE";

export type SemanticTransitionState = {
  readonly type: TransitionTypeV1;
  readonly progress: number;
  readonly outgoingOpacity: number;
  readonly incomingOpacity: number;
  readonly outgoingTranslateXNorm: number;
  readonly outgoingTranslateYNorm: number;
  readonly incomingTranslateXNorm: number;
  readonly incomingTranslateYNorm: number;
  readonly complete: boolean;
};

export function transitionLocalProgress(args: {
  readonly transitionElapsedMs: number;
  readonly durationMs: number;
}): number {
  const { transitionElapsedMs, durationMs } = args;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (!Number.isFinite(transitionElapsedMs)) return 0;
  return clampUnit(transitionElapsedMs / durationMs);
}

export function evaluateTransitionProgress(
  transition:
    | TransitionV1
    | { readonly type: string; readonly durationMs?: number },
  progressRaw: number,
):
  | { readonly ok: true; readonly value: SemanticTransitionState }
  | { readonly ok: false; readonly reason: string } {
  const t = (transition as { type?: unknown }).type;
  if (typeof t === "string" && isMotionTypeV1(t) && !isTransitionTypeV1(t)) {
    return { ok: false, reason: "transition_motion_token_forbidden" };
  }
  const normalized = normalizeTransitionV1(transition);
  if (!normalized) {
    return { ok: false, reason: "transition_unsupported" };
  }

  const progress = clampUnit(progressRaw);
  const complete = progress >= 1;
  const d = TRANSITION_SLIDE_DISTANCE_NORM;

  if (normalized.type === "CUT") {
    // Deterministic: no fade, no platform animation. Instant swap at any progress>=0 once started.
    return {
      ok: true,
      value: {
        type: "CUT",
        progress: complete || progress > 0 ? 1 : 0,
        outgoingOpacity: complete || progress > 0 ? 0 : 1,
        incomingOpacity: complete || progress > 0 ? 1 : 0,
        outgoingTranslateXNorm: 0,
        outgoingTranslateYNorm: 0,
        incomingTranslateXNorm: 0,
        incomingTranslateYNorm: 0,
        complete: complete || progress > 0,
      },
    };
  }

  if (normalized.type === "FADE") {
    return {
      ok: true,
      value: {
        type: "FADE",
        progress,
        outgoingOpacity: 1 - progress,
        incomingOpacity: progress,
        outgoingTranslateXNorm: 0,
        outgoingTranslateYNorm: 0,
        incomingTranslateXNorm: 0,
        incomingTranslateYNorm: 0,
        complete,
      },
    };
  }

  // SLIDE_*: outgoing exits in named direction; incoming enters from opposite.
  let outX = 0;
  let outY = 0;
  let inX = 0;
  let inY = 0;
  switch (normalized.type) {
    case "SLIDE_LEFT":
      outX = -progress * d;
      inX = (1 - progress) * d;
      break;
    case "SLIDE_RIGHT":
      outX = progress * d;
      inX = -(1 - progress) * d;
      break;
    case "SLIDE_UP":
      outY = -progress * d;
      inY = (1 - progress) * d;
      break;
    case "SLIDE_DOWN":
      outY = progress * d;
      inY = -(1 - progress) * d;
      break;
    default:
      return { ok: false, reason: "transition_unsupported" };
  }

  return {
    ok: true,
    value: {
      type: normalized.type,
      progress,
      outgoingOpacity: 1,
      incomingOpacity: 1,
      outgoingTranslateXNorm: outX,
      outgoingTranslateYNorm: outY,
      incomingTranslateXNorm: inX,
      incomingTranslateYNorm: inY,
      complete,
    },
  };
}

export function evaluateTransitionAtElapsed(
  transition: TransitionV1,
  transitionElapsedMs: number,
):
  | { readonly ok: true; readonly value: SemanticTransitionState }
  | { readonly ok: false; readonly reason: string } {
  const p = transitionLocalProgress({
    transitionElapsedMs,
    durationMs: transition.durationMs,
  });
  return evaluateTransitionProgress(transition, p);
}
