/**
 * DISMISS SSOT — X / Back / ESC / explicit close / CTA close lifecycle.
 * Frequency policy is the canonical suppression authority.
 * IMPRESSION must never call this.
 */

import {
  normalizePlatformPopupFrequencyMode,
  type PlatformPopupFrequencyMode,
} from "@/lib/platform-popup/presentation-contract";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

/**
 * Map campaign frequency → suppress mode written on dismiss.
 * close_only → CLOSE (exposure ends; no frequency cap).
 */
export function frequencyModeToDismissSuppressMode(
  frequency: PlatformPopupFrequencyMode | string | null | undefined
): PlatformPopupSuppressionMode {
  const mode = normalizePlatformPopupFrequencyMode(frequency);
  switch (mode) {
    case "once_per_session":
      return "SESSION";
    case "once_per_day":
      return "TODAY";
    case "once_campaign":
      return "CAMPAIGN";
    case "close_only":
      return "CLOSE";
  }
}

export type PlatformPopupDismissReason =
  | "close_control"
  | "android_back"
  | "escape"
  | "backdrop"
  | "cta_lifecycle"
  | "explicit";

export function isFrequencySuppressMode(mode: PlatformPopupSuppressionMode): boolean {
  return mode === "SESSION" || mode === "TODAY" || mode === "CAMPAIGN" || mode === "DURATION";
}
