/**
 * DIBAY INTRO — Phase 1
 * Domain-separated status enums. No shared generic READY across domains.
 */

export const MediaStatus = {
  UPLOADED: "MEDIA_UPLOADED",
  PROCESSING: "MEDIA_PROCESSING",
  READY: "MEDIA_READY",
  FAILED: "MEDIA_FAILED",
} as const;
export type MediaStatus = (typeof MediaStatus)[keyof typeof MediaStatus];

export const PublishStatus = {
  DRAFT: "PUBLISH_DRAFT",
  VALIDATING: "PUBLISH_VALIDATING",
  COMMITTED: "PUBLISH_COMMITTED",
  FAILED: "PUBLISH_FAILED",
} as const;
export type PublishStatus = (typeof PublishStatus)[keyof typeof PublishStatus];

export const ServerLiveStatus = {
  NO_LIVE_INTRO: "NO_LIVE_INTRO",
  LIVE: "SERVER_LIVE",
  FETCH_FAILURE: "SERVER_LIVE_FETCH_FAILURE",
  INCOMPATIBLE: "SERVER_LIVE_INCOMPATIBLE",
  ALREADY_SYNCED: "SERVER_LIVE_ALREADY_SYNCED",
} as const;
export type ServerLiveStatus =
  (typeof ServerLiveStatus)[keyof typeof ServerLiveStatus];

export const DeviceCandidateStatus = {
  CANDIDATE: "DEVICE_CANDIDATE",
  READY: "DEVICE_READY",
  ACTIVE: "DEVICE_ACTIVE",
  REJECTED: "DEVICE_REJECTED",
} as const;
export type DeviceCandidateStatus =
  (typeof DeviceCandidateStatus)[keyof typeof DeviceCandidateStatus];

/** Visible presentation pass — distinct from DEVICE_ACTIVE. */
export const DeviceVisibleStatus = {
  PASS: "DEVICE_VISIBLE_PASS",
  FAIL: "DEVICE_VISIBLE_FAIL",
} as const;
export type DeviceVisibleStatus =
  (typeof DeviceVisibleStatus)[keyof typeof DeviceVisibleStatus];

export type NoLiveIntroResponse = {
  kind: typeof ServerLiveStatus.NO_LIVE_INTRO;
};

export function isNoLiveIntro(
  response: { kind: string },
): response is NoLiveIntroResponse {
  return response.kind === ServerLiveStatus.NO_LIVE_INTRO;
}
