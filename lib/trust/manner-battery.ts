/**
 * 신뢰 점수(0~100) → 6단계 구간 (구간은 trust-score-core와 동일).
 * 화면 표기·색은 CREW REP 단일 정의 `lib/trust/crew-rep.ts` 만 쓴다 (배터리 아이콘·% 폐지, Owner 2026-11-16).
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
