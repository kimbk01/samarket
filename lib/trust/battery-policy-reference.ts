/**
 * 배터리 %·단계 정책 — 어드민 안내·표기용
 * Scoring authority: manner-battery-policy-v1 (NOT TRUST_EVENT_DELTAS).
 */

import type { MannerBatteryTier } from "./manner-battery";
import { legacyMannerFieldToTrustScore } from "./profile-trust-display";
import {
  BATTERY_SEGMENT_COUNT,
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
  TRUST_TIER_RANGE_LABELS_KO,
  trustScoreToBatteryLevel,
  trustScoreToUiPercent,
} from "./trust-score-core";
import {
  MANNER_CALC_AMPLITUDE,
  MANNER_CALC_BAD_WEIGHT,
  MANNER_CALC_PRIOR,
  MANNER_POLICY_VERSION,
  MANNER_RECENCY_MULTIPLIER_V1,
  MANNER_WINDOW_DAYS,
} from "./manner-battery-policy-v1";

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
    "DIBAY는 동일 원칙(중립 시작·행동 이력)을 따르되 UI는 Manner Battery 0~100% 를 사용합니다.",
} as const;

export const KASAMA_PERCENT_TO_TIER_FORMULA =
  "DIBAY: Manner Battery 0~100 → 구간별 1~6단 (0~19=1 … 90~100=6)";

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

/** Admin cheatsheet — Manner Battery SSOT (legacy deltas removed from authority). */
export const TRUST_POLICY_CHEATSHEET = {
  policyVersion: MANNER_POLICY_VERSION,
  windowDays: MANNER_WINDOW_DAYS,
  dailyPositiveCap: 0,
  recentPositiveMultiplier: MANNER_RECENCY_MULTIPLIER_V1,
  eventDeltas: {
    trade_completed: `+bounded (amp=${MANNER_CALC_AMPLITUDE}, prior=${MANNER_CALC_PRIOR})`,
    trade_review_good: "+bounded",
    trade_review_normal: "0 (history only)",
    trade_review_bad: `-low (bad_weight=${MANNER_CALC_BAD_WEIGHT})`,
    report_created: "NOT eligible",
    community_activity: "INACTIVE",
    delivery_order_volume: "INACTIVE",
  } as const,
} as const;
