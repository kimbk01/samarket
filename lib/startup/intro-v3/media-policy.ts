/**
 * Intro V3 media policy slots.
 *
 * Authorities never collapse:
 * SOURCE limits ≠ DERIVATIVE limits ≠ LAYER binding ≠ Scene geometry.
 *
 * LOCKED this cut: STILL_RUNTIME long-edge = 1920 (derivative geometry, NOT Scene).
 * Numeric SOURCE/DERIVATIVE byte/pixel caps below are operational ceilings, NOT_PROVEN
 * as product authority. Do not treat 8MB / 3.2MB / 2MB as V3 product limits.
 */

export const INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX = 1920;

export const INTRO_V3_NUMERIC_POLICY_STATUS = "NOT_PROVEN" as const;

/** Operational ceiling only — not a proven product SOURCE max. */
export const INTRO_V3_SOURCE_MAX_BYTES = 32 * 1024 * 1024;
/** Operational ceiling only — not a proven product SOURCE pixel max. */
export const INTRO_V3_SOURCE_MAX_EDGE_PX = 8192;
/** Operational ceiling only — not a proven product DERIVATIVE byte max. */
export const INTRO_V3_DERIVATIVE_MAX_BYTES = 8 * 1024 * 1024;

export const INTRO_V3_STORAGE_BUCKET = "admin-notification-campaign-images";
export const INTRO_V3_SOURCE_FOLDER = "_admin/intro-v3/sources";
export const INTRO_V3_DERIVATIVE_FOLDER = "_admin/intro-v3/derivatives";

export const INTRO_V3_STILL_RUNTIME_WEBP_QUALITY = 88;
export const INTRO_V3_SIGNED_UPLOAD_EXPIRES_SEC = 15 * 60;

export const INTRO_V3_ACCEPT_SOURCE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export type IntroV3ProcessErrorCode =
  | "unsupported_format"
  | "source_too_large"
  | "source_pixels_too_large"
  | "decode_failed"
  | "processing_failed"
  | "network_upload_failed"
  | "storage_failed"
  | "asset_persistence_failed"
  | "derivative_failed";

export const INTRO_V3_PROCESS_ERROR_CODES: readonly IntroV3ProcessErrorCode[] = [
  "unsupported_format",
  "source_too_large",
  "source_pixels_too_large",
  "decode_failed",
  "processing_failed",
  "network_upload_failed",
  "storage_failed",
  "asset_persistence_failed",
  "derivative_failed",
] as const;

export function isIntroV3ProcessErrorCode(raw: string | null | undefined): raw is IntroV3ProcessErrorCode {
  return INTRO_V3_PROCESS_ERROR_CODES.includes(raw as IntroV3ProcessErrorCode);
}
