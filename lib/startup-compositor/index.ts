/**
 * REBUILD 14 — Startup Compositor
 * (P1–P4 + P5 canonical geometry/motion/transition/CTA/clock execution).
 * PRODUCTION presentation = inactive until P7.
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

export {
  BRAND_SIZE_NORM,
  brandSizeNormForPreset,
  computeBrandNormalizedRect,
  SYSTEM_START_COMPOSITION,
  type NormalizedBrandRect,
} from "@/lib/startup-compositor/system-start/brand-geometry";

export {
  resolveActiveGenerationMedia,
  assertSameGenerationMedia,
  type MediaAvailabilityEntry,
  type MediaResolveResult,
  type ResolvedMediaRef,
} from "@/lib/startup-compositor/system-start/media";

export {
  SYSTEM_START_BACKGROUND_IMAGE_FIT,
  type SystemStartBackgroundDraw,
  type SystemStartBackgroundImageFit,
  type SystemStartBrandDraw,
  type SystemStartRenderModel,
} from "@/lib/startup-compositor/system-start/render-model";

export {
  buildSystemStartRenderModel,
  systemStartRenderSemanticsKey,
  type BackgroundImageFailurePolicy,
  type BuildSystemStartRenderInput,
  type BuildSystemStartRenderResult,
} from "@/lib/startup-compositor/system-start/render";

export {
  SYSTEM_START_PHASE,
  advanceSystemStartReadiness,
  createSystemStartPhaseState,
  mayClaimOwnerVisible,
  type SystemStartPhaseState,
  type SystemStartReadiness,
} from "@/lib/startup-compositor/system-start/phase";

export {
  SystemStartMinVisibleGate,
  type Clock,
  type SystemStartMinVisibleState,
} from "@/lib/startup-compositor/system-start/timing";

export {
  INTRO_MEDIA_FORMATS,
  INTRO_MEDIA_FORMAT_CONTRACTS,
  SCENE_BACKGROUND_GIF_SUPPORTED,
  SCENE_BACKGROUND_VIDEO_SUPPORTED,
  SCENE_BACKGROUND_KINDS,
  isIntroMediaFormat,
  normalizeIntroMediaFormat,
  type IntroMediaFormat,
  type MediaFormatContract,
  type SceneBackgroundKind,
} from "@/lib/startup-compositor/intro/media-formats";

export {
  createScene,
  renameScene,
  duplicateScene,
  reorderScenes,
  deleteScene,
  assertUniqueSceneIds,
  type SceneOpsResult,
} from "@/lib/startup-compositor/intro/document-ops";

export {
  replaceElementMedia,
  type ReplaceMediaResult,
} from "@/lib/startup-compositor/intro/replace";

export {
  DEFAULT_ELEMENT_FIT,
  centerNormalizedFrame,
  isNormalizedFrameInRange,
  containMediaFrame,
  centerFrame,
  defaultImageInsertFrame,
  defaultLogoInsertFrame,
} from "@/lib/startup-compositor/intro/geometry";

export {
  INTRO_VISIBILITY_LADDER,
  INTRO_OWNER_VISIBLE_DEVICE_PROVEN,
  canAdvanceIntroVisibility,
  introVisibilityRank,
  type IntroVisibilityStep,
} from "@/lib/startup-compositor/intro/phase";

export {
  INTRO_TIMELINE_POLICY,
  IntroTimelineClock,
  type IntroTimelinePolicy,
  type IntroTimelineState,
} from "@/lib/startup-compositor/intro/timeline";

export {
  IntroCtaActionGate,
  mapDocumentCtaAction,
  rejectRawUrlDestination,
  CTA_INTERNAL_DESTINATION_REGISTRY,
  type IntroCtaIntent,
  type IntroCtaActionKind,
  type CtaDispatchResult,
} from "@/lib/startup-compositor/intro/cta";

export {
  evaluateSsToIntroHandoff,
  evaluateIntroToHomeHandoff,
  evaluateSsToHomeWhenIntroAbsent,
  HandoffOnceGate,
} from "@/lib/startup-compositor/intro/handoff";

export {
  policyForInvalidIntroBeforeVisibility,
  policyForBadScene1,
  policyForLaterSceneFailure,
  policyForMissingRequiredMedia,
  INTRO_FAILURE_FORBIDDEN_SURFACES,
  INTRO_MEDIA_FALLBACK_FORBIDDEN,
} from "@/lib/startup-compositor/intro/failure";

export {
  documentToIntroRenderModel,
  introRenderModelHasEditorChrome,
  type IntroRenderModel,
  type IntroAbsentModel,
  type IntroPhaseModel,
  type IntroSceneRenderNode,
  type IntroElementRenderNode,
} from "@/lib/startup-compositor/intro/render-model";

export {
  buildIntroRenderModel,
  parseIntroDocument,
  isElementTypeSupported,
  INTRO_READINESS_POLICY,
  type BuildIntroRenderInput,
  type BuildIntroRenderResult,
} from "@/lib/startup-compositor/intro/render";

export {
  CANONICAL_COMPOSITION_ASPECT,
  applyExplicitCenter,
  explicitCenterFrame,
  fitIntrinsicIntoMaxBox,
  fitMediaDrawInFrame,
  coverMediaFrame,
  projectCompositionRegion,
  projectFrameToPixels,
  CANONICAL_AUTHORITY_ROWS,
  MOTION_ENTER_DISTANCE_NORM,
  MOTION_ENTER_DISTANCE_CLASSIFICATION,
  MOTION_SCALE_IN_INITIAL,
  MOTION_SCALE_IN_CLASSIFICATION,
  MOTION_EASING,
  MOTION_EASING_CLASSIFICATION,
  clampUnit,
  motionLocalProgress,
  evaluateMotionProgress,
  evaluateMotionAtSceneElapsed,
  TRANSITION_DURATION_MODE,
  TRANSITION_DURATION_MODE_CLASSIFICATION,
  TRANSITION_SLIDE_DISTANCE_NORM,
  evaluateTransitionProgress,
  evaluateTransitionAtElapsed,
  CTA_DESTINATION_TABLE,
  resolveCtaDestination,
  listCtaDestinationKeys,
  PREVIEW_SEMANTIC_MODULE_ID,
  NATIVE_SEMANTIC_MODULE_ID,
  createPreviewSemanticApi,
  createNativeAdapterContract,
  type FitMode,
  type MediaDrawFit,
  type SemanticMotionState,
  type SemanticTransitionState,
  type AuthorityRow,
} from "@/lib/startup-compositor/execution/authority";

/** P6 Admin Studio authority (Save / Preview / Service Apply). */
export {
  STARTUP_AUTHORING_SCHEMA_VERSION,
  createEmptyAuthoringDocument,
  authoringContentFingerprint,
  hasUnsavedAuthoringChanges,
  parseAuthoringDocument,
  validateAuthoringDocument,
  saveAuthoringDraft,
  createMemoryDraftStore,
  PREVIEW_SOURCE,
  buildPreviewFromWorkingDocument,
  assertPreviewUsesWorkingDocument,
  applyServiceFromSavedDraft,
  buildStartupPackageEnvelope,
  createMemoryLiveRepository,
  humanizeAuthoringError,
  ADMIN_MEDIA_CAPABILITIES,
  MP4_AUDIO_PRODUCT_DECISION,
  MP4_AUDIO_ADMIN_CONTROLS_EXPOSED,
  isAdminMediaExposed,
  insertImageElementFrame,
  replaceElementMediaId,
  centerElementFrame,
  type StartupAuthoringDocument,
  type SaveDraftResult,
  type DraftStore,
  type PreviewBuildResult,
  type ServiceApplyResult,
  type ImmutableReleaseRecord,
  type StartupLiveRepository,
} from "@/lib/startup-compositor/admin";
