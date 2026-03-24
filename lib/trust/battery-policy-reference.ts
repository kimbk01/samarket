/**
 * 배터리 %·단계 정책 — 어드민 안내·표기용
 */

import type { MannerBatteryTier } from "./manner-battery";
import { legacyMannerFieldToTrustScore } from "./profile-trust-display";
import {
  BATTERY_SEGMENT_COUNT,
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
  TRUST_DAILY_POSITIVE_CAP,
  TRUST_EVENT_DELTAS,
  TRUST_RECENT_POSITIVE_MULTIPLIER,
  TRUST_TIER_RANGE_LABELS_KO,
  trustScoreToBatteryLevel,
  trustScoreToUiPercent,
} from "./trust-score-core";

export {
  BATTERY_SEGMENT_COUNT,
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
} from "./trust-score-core";

export const DAANGN_MANNER_TEMP_REFERENCE = {
  neutralExampleC: 36.5,
  typicalRangeC: { min: 30, max: 50 } as const,
  citationNote:
    "당근(Daangn/Karrot) **매너 온도**는 신뢰를 **체온(°C)** 형태로 보여 줍니다. " +
    "가이드·커뮤니티에서 **신규·중립이 약 36.5°C** 근처로 설명되는 경우가 많고, " +
    "표시값이 **대략 30~50°C** 구간에서 움직인다고 알려져 있습니다. (실제 구간은 앱 정책에 따릅니다.)",
} as const;

export const KASAMA_PERCENT_TO_TIER_FORMULA =
  "카마켓: 내부 신뢰 점수 0~100 → 구간별 1~6단 (0~19=1 … 90~100=6)";

export interface BatteryTierRangeRow {
  tier: MannerBatteryTier;
  segmentsFilled: number;
  percentRangeLabelKo: string;
}

export function getBatteryTierRangeTable(): BatteryTierRangeRow[] {
  return TRUST_TIER_RANGE_LABELS_KO.map(({ level, label }) => ({
    tier: level as MannerBatteryTier,
    segmentsFilled: level,
    percentRangeLabelKo: label,
  }));
}

/** 어드민 미리보기 — trust: 내부 점수(0~100), legacy_temp: °C 체감값 */
export function previewBatteryFromRaw(
  raw: number,
  mode: "trust" | "legacy_temp" = "trust"
): {
  raw: number;
  percent: number;
  tier: MannerBatteryTier;
} {
  const x = Number(raw);
  const score = mode === "legacy_temp" ? legacyMannerFieldToTrustScore(x) : trustScoreToUiPercent(x);
  const percent = trustScoreToUiPercent(score);
  const tier = trustScoreToBatteryLevel(score);
  return { raw: x, percent, tier };
}

export const TRUST_POLICY_CHEATSHEET = {
  dailyPositiveCap: TRUST_DAILY_POSITIVE_CAP,
  recentPositiveMultiplier: TRUST_RECENT_POSITIVE_MULTIPLIER,
  eventDeltas: TRUST_EVENT_DELTAS,
} as const;
