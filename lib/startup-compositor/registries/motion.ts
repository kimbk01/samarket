/**
 * REBUILD 14 — motion capability registry (semantic reuse from intro contracts).
 */

export {
  DEFAULT_MOTION,
  MOTION_TYPES_V1,
  MOTION_OPERATOR_LABELS,
  isMotionTypeV1,
  normalizeMotionV1,
  type MotionTypeV1,
  type MotionV1,
} from "@/lib/intro/contracts/capability-registry";

import { normalizeMotionV1 } from "@/lib/intro/contracts/capability-registry";

export type MotionTokenValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** Fail-closed: unsupported / transition tokens as motion → reject. */
export function validateMotionToken(raw: unknown): MotionTokenValidation {
  if (raw == null) return { ok: false, reason: "motion_missing" };
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.type === "string" && o.type.startsWith("SLIDE_")) {
      return { ok: false, reason: "motion_transition_token_forbidden" };
    }
  }
  const n = normalizeMotionV1(raw);
  if (!n) return { ok: false, reason: "motion_unsupported" };
  return { ok: true };
}
