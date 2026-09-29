/**
 * DIBAY INTRO — Phase 2
 * Physical DB / Storage / Security authority constants.
 * Schema-only alignment with locked Gates. No processor / Admin / Publish runtime.
 */

export const APP_INTRO_TABLES = [
  "app_intro_documents",
  "app_intro_media",
  "app_intro_source_generations",
  "app_intro_runtime_artifacts",
  "app_intro_publish_operations",
  "app_intro_revisions",
  "app_intro_sealed_assets",
  "app_intro_packs",
  "app_intro_live",
] as const;

export type AppIntroTable = (typeof APP_INTRO_TABLES)[number];

/** Library media lifecycle — relational envelope (broader than Phase 1 MediaStatus product enums). */
export const AppIntroMediaLifecycleState = {
  CREATED: "CREATED",
  UPLOADING: "UPLOADING",
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  DELETING: "DELETING",
  DELETED: "DELETED",
} as const;
export type AppIntroMediaLifecycleState =
  (typeof AppIntroMediaLifecycleState)[keyof typeof AppIntroMediaLifecycleState];

/** Forbidden — must never appear in DB check constraint or product code. */
export const FORBIDDEN_MEDIA_STATE = "PARTIALLY_READY" as const;

export const AppIntroPublishOpStatus = {
  PREPARING: "PREPARING",
  READY_TO_COMMIT: "READY_TO_COMMIT",
  COMMITTED: "COMMITTED",
  FAILED: "FAILED",
} as const;
export type AppIntroPublishOpStatus =
  (typeof AppIntroPublishOpStatus)[keyof typeof AppIntroPublishOpStatus];

/**
 * Physical Live discriminant.
 * Device API maps NEVER_CONFIGURED and NO_LIVE_INTRO → contract ServerLiveStatus.NO_LIVE_INTRO.
 */
export const AppIntroLiveKind = {
  NEVER_CONFIGURED: "NEVER_CONFIGURED",
  NO_LIVE_INTRO: "NO_LIVE_INTRO",
  COMMITTED_LIVE: "COMMITTED_LIVE",
} as const;
export type AppIntroLiveKind =
  (typeof AppIntroLiveKind)[keyof typeof AppIntroLiveKind];

export const APP_INTRO_STORAGE_BUCKET = "dibay-intro" as const;
export const APP_INTRO_STORAGE_AUTHORITY_PREFIX = "authority/v1/" as const;

export const AppIntroStorageSubspace = {
  SOURCE: "authority/v1/source/",
  TMP: "authority/v1/tmp/",
  RUNTIME: "authority/v1/runtime/",
  SEALED: "authority/v1/sealed/",
  PACKS: "authority/v1/packs/",
} as const;

export const APP_INTRO_MUTATION_AUTHORITY = {
  path: "server_admin_api_requireAdmin_to_service_role",
  browserServiceRole: false,
  anonMutation: false,
  broadAuthenticatedMutation: false,
  directClientTablePolicies: false,
} as const;

export function mapsToDeviceNoLiveIntro(kind: AppIntroLiveKind): boolean {
  return (
    kind === AppIntroLiveKind.NEVER_CONFIGURED ||
    kind === AppIntroLiveKind.NO_LIVE_INTRO
  );
}
