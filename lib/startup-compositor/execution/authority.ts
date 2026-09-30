/**
 * REBUILD 14 P5 — Canonical execution authority index.
 *
 * ONE place future Preview / Android / iOS import for geometry / motion /
 * transition / CTA / visibility clock semantics.
 */

export {
  CANONICAL_COMPOSITION_ASPECT,
  applyExplicitCenter,
  explicitCenterFrame,
  fitIntrinsicIntoMaxBox,
  fitMediaDrawInFrame,
  coverMediaFrame,
  containMediaFrame,
  parseNormalizedFrame,
  fitContentRegion,
  projectCompositionRegion,
  projectFrameToPixels,
  type FitMode,
  type MediaDrawFit,
  type NormalizedFrame,
} from "@/lib/startup-compositor/execution/geometry";

export {
  MOTION_ENTER_DISTANCE_NORM,
  MOTION_ENTER_DISTANCE_CLASSIFICATION,
  MOTION_SCALE_IN_INITIAL,
  MOTION_SCALE_IN_CLASSIFICATION,
  MOTION_EASING,
  MOTION_EASING_CLASSIFICATION,
  clampUnit,
  applyMotionEasing,
  motionLocalProgress,
  evaluateMotionProgress,
  evaluateMotionAtSceneElapsed,
  type SemanticMotionState,
} from "@/lib/startup-compositor/execution/motion";

export {
  TRANSITION_DURATION_MODE,
  TRANSITION_DURATION_MODE_CLASSIFICATION,
  TRANSITION_SLIDE_DISTANCE_NORM,
  TRANSITION_SLIDE_DISTANCE_CLASSIFICATION,
  TRANSITION_EASING,
  TRANSITION_EASING_CLASSIFICATION,
  transitionLocalProgress,
  evaluateTransitionProgress,
  evaluateTransitionAtElapsed,
  type SemanticTransitionState,
} from "@/lib/startup-compositor/execution/transition";

export {
  CTA_DESTINATION_TABLE,
  resolveCtaDestination,
  listCtaDestinationKeys,
} from "@/lib/startup-compositor/execution/cta-destination";

export {
  PREVIEW_SEMANTIC_MODULE_ID,
  NATIVE_SEMANTIC_MODULE_ID,
  createPreviewSemanticApi,
  createNativeAdapterContract,
} from "@/lib/startup-compositor/execution/adapters";

export {
  IntroTimelineClock,
  INTRO_TIMELINE_POLICY,
} from "@/lib/startup-compositor/intro/timeline";

export {
  IntroCtaActionGate,
  mapDocumentCtaAction,
  rejectRawUrlDestination,
} from "@/lib/startup-compositor/intro/cta";

export {
  validateMotionToken,
  MOTION_TYPES_V1,
  normalizeMotionV1,
} from "@/lib/startup-compositor/registries/motion";

export {
  validateTransitionToken,
  TRANSITION_TYPES_V1,
  normalizeTransitionV1,
} from "@/lib/startup-compositor/registries/transition";

export {
  CTA_INTERNAL_DESTINATIONS,
  parseCtaAction,
  isCtaInternalDestination,
} from "@/lib/startup-compositor/registries/cta";

export type AuthorityRow = {
  readonly concern: string;
  readonly canonicalAuthority: string;
  readonly duplicates: readonly string[];
  readonly action: "RETAIN" | "DELEGATE" | "COMPLETE_IN_P5";
};

/** Static authority map for audits / P5-48…51. */
export const CANONICAL_AUTHORITY_ROWS: readonly AuthorityRow[] = [
  {
    concern: "normalized_geometry",
    canonicalAuthority: "lib/startup-compositor/execution/geometry.ts",
    duplicates: [
      "lib/startup-compositor/geometry.ts (parse/validate)",
      "lib/startup-compositor/intro/geometry.ts (re-export)",
    ],
    action: "DELEGATE",
  },
  {
    concern: "fit_contain_cover",
    canonicalAuthority: "lib/startup-compositor/execution/geometry.ts#fitMediaDrawInFrame",
    duplicates: [
      "lib/intro/geometry/fit.ts (composition letterbox)",
      "lib/intro/geometry/element-layout.ts (containMediaFrame insert)",
    ],
    action: "DELEGATE",
  },
  {
    concern: "motion_registry",
    canonicalAuthority: "lib/startup-compositor/registries/motion.ts",
    duplicates: ["lib/intro/contracts/capability-registry.ts (source tokens)"],
    action: "RETAIN",
  },
  {
    concern: "motion_execution",
    canonicalAuthority: "lib/startup-compositor/execution/motion.ts",
    duplicates: [],
    action: "COMPLETE_IN_P5",
  },
  {
    concern: "transition_registry",
    canonicalAuthority: "lib/startup-compositor/registries/transition.ts",
    duplicates: ["lib/intro/contracts/capability-registry.ts (source tokens)"],
    action: "RETAIN",
  },
  {
    concern: "transition_execution",
    canonicalAuthority: "lib/startup-compositor/execution/transition.ts",
    duplicates: [],
    action: "COMPLETE_IN_P5",
  },
  {
    concern: "cta_registry",
    canonicalAuthority: "lib/startup-compositor/registries/cta.ts",
    duplicates: ["lib/startup-compositor/intro/cta.ts (gate/dispatch)"],
    action: "RETAIN",
  },
  {
    concern: "cta_destination",
    canonicalAuthority: "lib/startup-compositor/execution/cta-destination.ts",
    duplicates: [],
    action: "COMPLETE_IN_P5",
  },
  {
    concern: "visibility_clock",
    canonicalAuthority: "lib/startup-compositor/intro/timeline.ts",
    duplicates: [],
    action: "RETAIN",
  },
] as const;
