/**
 * REBUILD 14 P6 — Admin Studio authority surface.
 */

export {
  STARTUP_AUTHORING_SCHEMA_VERSION,
  createEmptyAuthoringDocument,
  defaultSystemStartIR,
  authoringContentFingerprint,
  hasUnsavedAuthoringChanges,
  parseAuthoringDocument,
  type StartupAuthoringDocument,
  type AuthoringParseResult,
} from "@/lib/startup-compositor/admin/authoring-document";

export {
  validateAuthoringDocument,
  type AuthoringValidation,
} from "@/lib/startup-compositor/admin/validate";

export {
  saveAuthoringDraft,
  createMemoryDraftStore,
  type SaveDraftResult,
  type DraftStore,
} from "@/lib/startup-compositor/admin/save-draft";

export {
  PREVIEW_SOURCE,
  buildPreviewFromWorkingDocument,
  assertPreviewUsesWorkingDocument,
  type PreviewBuildResult,
} from "@/lib/startup-compositor/admin/preview";

export {
  applyServiceFromSavedDraft,
  buildStartupPackageEnvelope,
  type ServiceApplyResult,
  type ServiceApplyArgs,
} from "@/lib/startup-compositor/admin/service-apply";

export {
  createMemoryLiveRepository,
  type ImmutableReleaseRecord,
  type StartupLiveRepository,
} from "@/lib/startup-compositor/admin/live-repository";

export { humanizeAuthoringError } from "@/lib/startup-compositor/admin/human-errors";

export {
  ADMIN_MEDIA_CAPABILITIES,
  MP4_AUDIO_PRODUCT_DECISION,
  MP4_AUDIO_ADMIN_CONTROLS_EXPOSED,
  isAdminMediaExposed,
  type AdminMediaKind,
  type AdminMediaCapability,
} from "@/lib/startup-compositor/admin/media-capability";

export {
  insertImageElementFrame,
  replaceElementMediaId,
  centerElementFrame,
} from "@/lib/startup-compositor/admin/scene-ops";
