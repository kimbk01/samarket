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

/**
 * Spec [6] fill — low tiers = status (not brand); high tiers = DIBAY green HARD LOCK.
 * DO NOT use Karrot product orange as brand fill.
 */
export const MANNER_BATTERY_TIER_COLORS: Record<MannerBatteryTier, string> = {
  1: "#EF4444",
  2: "#DC2626",
  3: "#CA8A04",
  4: "#4D7C0F",
  5: "#166534",
  6: "#0B421A", // --dibay-green
};

export function mannerBatteryAccentClass(tier: MannerBatteryTier): string {
  switch (tier) {
    case 1:
      return "text-red-500";
    case 2:
      return "text-red-600";
    case 3:
      return "text-yellow-600";
    case 4:
      return "text-lime-700";
    case 5:
      return "text-sam-primary";
    default:
      return "text-sam-primary";
  }
}
