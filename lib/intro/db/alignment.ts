/**
 * DIBAY INTRO — Phase 2
 * Contract ↔ DB alignment notes (intentional differences only).
 */

import { GifRuntimeFormat } from "../contracts/gif";
import { MediaStatus, ServerLiveStatus } from "../contracts/status";
import {
  AppIntroLiveKind,
  AppIntroMediaLifecycleState,
  AppIntroPublishOpStatus,
  FORBIDDEN_MEDIA_STATE,
  mapsToDeviceNoLiveIntro,
} from "./authority";

/**
 * Phase 1 MediaStatus is a product-facing subset.
 * DB lifecycle envelope includes CREATED/UPLOADING/DELETING/DELETED for Library ops.
 * Mapping is intentional — not field-name drift requiring silent rewrite.
 */
export const MEDIA_STATUS_TO_LIFECYCLE: Record<
  MediaStatus,
  AppIntroMediaLifecycleState
> = {
  [MediaStatus.UPLOADED]: AppIntroMediaLifecycleState.UPLOADED,
  [MediaStatus.PROCESSING]: AppIntroMediaLifecycleState.PROCESSING,
  [MediaStatus.READY]: AppIntroMediaLifecycleState.READY,
  [MediaStatus.FAILED]: AppIntroMediaLifecycleState.FAILED,
};

export const GIF_DB_RUNTIME_FORMAT = GifRuntimeFormat.CANONICAL_ANIMATED_GIF;

export const PUBLISH_OP_STATUSES = Object.values(AppIntroPublishOpStatus);

export function deviceLiveKindFromPhysical(
  kind: AppIntroLiveKind,
): typeof ServerLiveStatus.NO_LIVE_INTRO | "SERVER_LIVE_POINTER" {
  if (mapsToDeviceNoLiveIntro(kind)) return ServerLiveStatus.NO_LIVE_INTRO;
  return "SERVER_LIVE_POINTER";
}

export const INTENTIONAL_CONTRACT_DB_DIFFERENCES = [
  {
    topic: "media_status",
    authoredContract: "MediaStatus product enums (UPLOADED/PROCESSING/READY/FAILED)",
    relationalEnvelope:
      "CREATED/UPLOADING/UPLOADED/PROCESSING/READY/FAILED/DELETING/DELETED",
    translation: "explicit mapping via MEDIA_STATUS_TO_LIFECYCLE; no Scene/Layer SSOT",
  },
  {
    topic: "live_zero",
    authoredContract: "ServerLiveStatus.NO_LIVE_INTRO",
    relationalEnvelope: "NEVER_CONFIGURED vs NO_LIVE_INTRO vs COMMITTED_LIVE",
    translation:
      "NEVER_CONFIGURED and NO_LIVE_INTRO both map to device NO_LIVE_INTRO; not overloaded null",
  },
  {
    topic: "document_ssot",
    authoredContract: "IntroDocumentV1 JSONB with mediaRefId only",
    relationalEnvelope: "app_intro_documents.document jsonb + draft_version envelope",
    translation: "no duplicate Scene/Layer relational SSOT",
  },
  {
    topic: "gif_format",
    authoredContract: "GifRuntimeFormat.CANONICAL_ANIMATED_GIF",
    relationalEnvelope: "app_intro_runtime_artifacts.format text may equal CANONICAL_ANIMATED_GIF",
    translation: "same string; processor not implemented in Phase 2",
  },
  {
    topic: "forbidden_partial",
    authoredContract: "no PARTIALLY_READY",
    relationalEnvelope: `status check excludes ${FORBIDDEN_MEDIA_STATE}`,
    translation: "aligned",
  },
] as const;
