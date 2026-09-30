/**
 * REBUILD 14 — transition capability registry (separate from motion).
 */

export {
  DEFAULT_TRANSITION_CUT,
  DEFAULT_TRANSITION_FADE,
  TRANSITION_TYPES_V1,
  TRANSITION_OPERATOR_LABELS,
  isTransitionTypeV1,
  normalizeTransitionV1,
  transitionSlideAxis,
  type TransitionTypeV1,
  type TransitionV1,
} from "@/lib/intro/contracts/capability-registry";

import {
  isMotionTypeV1,
  isTransitionTypeV1,
  normalizeTransitionV1,
} from "@/lib/intro/contracts/capability-registry";

export type TransitionTokenValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export function validateTransitionToken(raw: unknown): TransitionTokenValidation {
  if (raw == null) return { ok: false, reason: "transition_missing" };
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (
      typeof o.type === "string" &&
      isMotionTypeV1(o.type) &&
      !isTransitionTypeV1(o.type)
    ) {
      return { ok: false, reason: "transition_motion_token_forbidden" };
    }
  }
  const n = normalizeTransitionV1(raw);
  if (!n) return { ok: false, reason: "transition_unsupported" };
  return { ok: true };
}
