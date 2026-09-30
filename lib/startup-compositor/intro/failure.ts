/**
 * REBUILD 14 P4 — Intro failure semantics (no error/navy/cream boards).
 */

export type IntroFailurePolicy =
  | {
      readonly kind: "INVALID_BEFORE_VISIBILITY";
      /** Remain on authored System Start; skip Intro; Home when ready. */
      readonly action: "REMAIN_SS_SKIP_INTRO";
    }
  | {
      readonly kind: "BAD_SCENE1_AFTER_READY_CHECK";
      readonly action: "SKIP_INTRO";
    }
  | {
      readonly kind: "LATER_SCENE_FAILURE";
      /** Keep last good authored scene; no error board. */
      readonly action: "KEEP_LAST_GOOD_SCENE";
    }
  | {
      readonly kind: "REQUIRED_MEDIA_MISSING";
      readonly action: "FAIL_CLOSED_SCENE_OR_INTRO";
    };

export function policyForInvalidIntroBeforeVisibility(): IntroFailurePolicy {
  return {
    kind: "INVALID_BEFORE_VISIBILITY",
    action: "REMAIN_SS_SKIP_INTRO",
  };
}

export function policyForBadScene1(): IntroFailurePolicy {
  return {
    kind: "BAD_SCENE1_AFTER_READY_CHECK",
    action: "SKIP_INTRO",
  };
}

export function policyForLaterSceneFailure(): IntroFailurePolicy {
  return {
    kind: "LATER_SCENE_FAILURE",
    action: "KEEP_LAST_GOOD_SCENE",
  };
}

export function policyForMissingRequiredMedia(): IntroFailurePolicy {
  return {
    kind: "REQUIRED_MEDIA_MISSING",
    action: "FAIL_CLOSED_SCENE_OR_INTRO",
  };
}

/** Forbidden visual surfaces on failure. */
export const INTRO_FAILURE_FORBIDDEN_SURFACES = [
  "error_board",
  "navy_board",
  "cream_board",
  "fallback_logo",
  "blank_frame",
] as const;

export const INTRO_MEDIA_FALLBACK_FORBIDDEN = [
  "cross_generation",
  "network",
  "bootstrap_after_owner",
  "app_bundle_replacement",
] as const;
