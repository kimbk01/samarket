/**
 * 신뢰 점수(0~100) — 내부 산출·단계 매핑 (UI는 배터리 6단계)
 * 참고: 외부 스펙(이벤트 가중·구간)과 정렬, 운영 판단은 주석에 명시
 */

/** 배터리 시각 칸 수 (단계 수) */
export const BATTERY_SEGMENT_COUNT = 6;

export const TRUST_SCORE_DEFAULT = 50;
export const TRUST_SCORE_MIN = 0;
export const TRUST_SCORE_MAX = 100;

/** 일일 가산 상한 (조작·급등 완화) */
export const TRUST_DAILY_POSITIVE_CAP = 5;

/** 최근 30일 이벤트: 가산에만 1.5배 (감산은 그대로 — 과도한 추가 하락 방지) */
export const TRUST_RECENT_POSITIVE_MULTIPLIER = 1.5;

/** 스펙 [2] 기본 이벤트 델타 */
export const TRUST_EVENT_DELTAS = {
  trade_complete: 2,
  manner_positive: 0.5,
  chat_fast_response: 0.3,
  no_show: -10,
  report: -5,
  block: -3,
} as const;

export type TrustEventKind = keyof typeof TRUST_EVENT_DELTAS;

export type TrustBatteryLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** 스펙 [5] 점수 → 배터리 단계 */
export function trustScoreToBatteryLevel(score: number): TrustBatteryLevel {
  const s = clampTrustScore(score);
  if (s <= 19) return 1;
  if (s <= 39) return 2;
  if (s <= 59) return 3;
  if (s <= 74) return 4;
  if (s <= 89) return 5;
  return 6;
}

export function clampTrustScore(n: number): number {
  if (!Number.isFinite(n)) return TRUST_SCORE_DEFAULT;
  const r = Math.round(n * 100) / 100;
  return Math.min(TRUST_SCORE_MAX, Math.max(TRUST_SCORE_MIN, r));
}

/** UI에 표시하는 정수 % (배터리 채움·라벨용) */
export function trustScoreToUiPercent(score: number): number {
  return Math.round(clampTrustScore(score));
}

export function computeWeightedDelta(baseDelta: number, applyRecentPositiveBoost: boolean): number {
  if (baseDelta === 0) return 0;
  if (applyRecentPositiveBoost && baseDelta > 0) {
    return Math.round(baseDelta * TRUST_RECENT_POSITIVE_MULTIPLIER * 100) / 100;
  }
  return Math.round(baseDelta * 100) / 100;
}

/** 오늘(UTC) 이미 반영된 가산 합에 맞춰 실제 가산치 상한 */
export function capPositiveDeltaByDailyLimit(
  proposedPositiveDelta: number,
  alreadyPositiveToday: number,
  cap: number = TRUST_DAILY_POSITIVE_CAP
): number {
  if (proposedPositiveDelta <= 0) return proposedPositiveDelta;
  const room = Math.max(0, cap - alreadyPositiveToday);
  return Math.min(proposedPositiveDelta, room);
}

/** 후기 1건에 대한 신뢰 점수 가산/감산 (스펙 manner_positive + 후기 톤) */
export function reviewTrustBaseDelta(
  publicType: "good" | "normal" | "bad",
  positiveTagCount: number
): number {
  if (publicType === "good") {
    let d = TRUST_EVENT_DELTAS.manner_positive;
    d += Math.min(positiveTagCount, 3) * 0.1;
    return Math.round(d * 100) / 100;
  }
  if (publicType === "normal") return 0.15;
  return -1.5;
}

export const TRUST_TIER_RANGE_LABELS_KO: { level: TrustBatteryLevel; label: string }[] = [
  { level: 1, label: "0 ~ 19 (위험)" },
  { level: 2, label: "20 ~ 39 (주의)" },
  { level: 3, label: "40 ~ 59 (기본)" },
  { level: 4, label: "60 ~ 74 (양호)" },
  { level: 5, label: "75 ~ 89 (우수)" },
  { level: 6, label: "90 ~ 100 (최고)" },
];

/** 레거시 manner_temperature(소수 °C) → trust % 환산용 (trust_score 컬럼 없을 때) */
export const KASAMA_LEGACY_TEMP_NEUTRAL = 36.5;
export const KASAMA_NEUTRAL_BATTERY_PERCENT = 50;
export const KASAMA_LEGACY_TEMP_INPUT_MAX = 55;
