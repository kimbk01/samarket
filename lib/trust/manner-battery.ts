/**
 * 배터리 UI: 신뢰 점수(0~100) → 6단계 시각 (구간은 trust-score-core와 동일)
 */

import type { TrustBatteryLevel } from "./trust-score-core";
import {
  BATTERY_SEGMENT_COUNT,
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
  trustScoreToBatteryLevel,
  trustScoreToUiPercent,
} from "./trust-score-core";

export { BATTERY_SEGMENT_COUNT } from "./trust-score-core";
export {
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
} from "./trust-score-core";

export type MannerBatteryTier = TrustBatteryLevel;

/** @deprecated 이름 호환 — 내부는 trustScoreToBatteryLevel */
export function mannerBatteryTier(score0to100: number): MannerBatteryTier {
  return trustScoreToBatteryLevel(score0to100);
}

/**
 * 신뢰 점수(0~100) → UI 정수 %.
 * 레거시 °C(`manner_temperature`)는 `resolveProfileTrustScore` / `legacyMannerFieldToTrustScore`에서 먼저 환산한다.
 */
export function mannerRawToPercent(raw: number): number {
  return trustScoreToUiPercent(raw);
}

export function mannerBatteryFilledSegments(tier: MannerBatteryTier): number {
  return tier;
}

/** 스펙 [6] 색 — 1 빨강 … 6 진한 초록 */
export const MANNER_BATTERY_TIER_COLORS: Record<MannerBatteryTier, string> = {
  1: "#EF4444",
  2: "#EA580C",
  3: "#EAB308",
  4: "#A3E635",
  5: "#22C55E",
  6: "#15803D",
};

export function mannerBatteryAccentClass(tier: MannerBatteryTier): string {
  switch (tier) {
    case 1:
      return "text-red-500";
    case 2:
      return "text-orange-600";
    case 3:
      return "text-yellow-500";
    case 4:
      return "text-lime-500";
    case 5:
      return "text-green-600";
    default:
      return "text-green-800";
  }
}
