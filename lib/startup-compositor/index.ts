/**
 * REBUILD 14 — Startup Compositor shared contract authority (P1) + runtime skeleton (P2).
 * P2: engine + thin hosts structurally present; PRODUCTION presentation = inactive.
 */

export {
  STARTUP_CONTENT_CLASSES,
  canBecomeActiveProductGeneration,
  canBootstrapBeColdActive,
  isStartupContentClass,
  type StartupContentClass,
} from "@/lib/startup-compositor/content-class";

export {
  STARTUP_PACKAGE_SCHEMA_VERSION,
  envelopeWithoutIntegrityField,
  parseStartupPackageEnvelope,
  type EnvelopeValidation,
  type MediaManifestEntry,
  type StartupPackageEnvelope,
} from "@/lib/startup-compositor/envelope";

export {
  parseSystemStartIR,
  type SystemStartIR,
  type SystemStartIRValidation,
} from "@/lib/startup-compositor/system-start-ir";

export {
  parseIntroEnvelope,
  type IntroEnvelope,
  type IntroEnvelopeValidation,
} from "@/lib/startup-compositor/intro-envelope";

export {
  createEmptyAuthorityState,
  establishBootstrapSeed,
  promoteStagingIfValid,
  resolveColdActive,
  stageGeneration,
  wouldBootstrapReactivateAfterOwner,
  type ActiveGenerationPointer,
  type GenerationAuthorityState,
  type GenerationId,
  type PromoteStagingResult,
  type ResolveColdActiveResult,
  type StoredGeneration,
} from "@/lib/startup-compositor/generation-authority";

export {
  computeEnvelopeIntegrity,
  computeMediaIntegrity,
  verifyEnvelopeIntegrity,
  canonicalizeStartupJson,
  type StartupIntegrityDigest,
} from "@/lib/startup-compositor/integrity";

export {
  STARTUP_STATES,
  STARTUP_TRANSITIONS,
  findTransitions,
  isStartupState,
  type StartupEvent,
  type StartupState,
  type StartupTransition,
} from "@/lib/startup-compositor/state-machine";

export {
  STARTUP_COMPOSITION_ASPECT,
  fitContentRegion,
  mapFrame,
  parseNormalizedFrame,
  type ContentRegion,
  type DeviceRect,
  type GeometryValidation,
  type NormalizedFrame,
} from "@/lib/startup-compositor/geometry";

export {
  validateMotionToken,
  MOTION_TYPES_V1,
  normalizeMotionV1,
  type MotionTokenValidation,
  type MotionTypeV1,
  type MotionV1,
} from "@/lib/startup-compositor/registries/motion";

export {
  validateTransitionToken,
  TRANSITION_TYPES_V1,
  normalizeTransitionV1,
  type TransitionTokenValidation,
  type TransitionTypeV1,
  type TransitionV1,
} from "@/lib/startup-compositor/registries/transition";

export {
  CTA_INTERNAL_DESTINATIONS,
  parseCtaAction,
  isCtaInternalDestination,
  type CtaAction,
  type CtaInternalDestination,
  type CtaValidation,
} from "@/lib/startup-compositor/registries/cta";

export {
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
  getStartupCompositorActivation,
  type StartupCompositorActivation,
} from "@/lib/startup-compositor/runtime/activation";

export {
  COMPOSITOR_EVENTS,
  COMPOSITOR_EVENT_OWNERSHIP,
  type CompositorEvent,
  type CompositorSurfacePhase,
  type EventOwnershipRow,
} from "@/lib/startup-compositor/runtime/events";

export {
  StartupCompositorEngine,
  type EngineActionResult,
} from "@/lib/startup-compositor/runtime/engine";
