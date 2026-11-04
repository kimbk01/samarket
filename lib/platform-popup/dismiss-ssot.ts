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

/**
 * F-2 (광고 표면 연동 · 2026-11-04): 숨김 판정은 **지금 빈도** 기준으로만 한다 — 빈도를 바꾼 캠페인에
 * 예전 빈도로 남은 숨김 행이 계속 막지 않게 한다 (팝업·PTR 같은 판정 `selectPlatformPopupEligibleWinner`).
 * - once_per_session → SESSION
 * - once_per_day → SESSION · TODAY
 * - once_campaign → SESSION · TODAY · CAMPAIGN · DURATION
 * - close_only → 서버 숨김 행 무시
 */
export function suppressionModesHonoredByFrequency(
  frequency: PlatformPopupFrequencyMode | string | null | undefined
): ReadonlySet<PlatformPopupSuppressionMode> {
  const mode = normalizePlatformPopupFrequencyMode(frequency);
  switch (mode) {
    case "once_per_session":
      return new Set<PlatformPopupSuppressionMode>(["SESSION"]);
    case "once_per_day":
      return new Set<PlatformPopupSuppressionMode>(["SESSION", "TODAY"]);
    case "once_campaign":
      return new Set<PlatformPopupSuppressionMode>(["SESSION", "TODAY", "CAMPAIGN", "DURATION"]);
    case "close_only":
      return new Set<PlatformPopupSuppressionMode>();
  }
}
