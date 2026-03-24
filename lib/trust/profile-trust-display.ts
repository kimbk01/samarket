/**
 * 프로필 행 → 배터리 UI용 신뢰 점수(0~100)
 * trust_score 우선, 없으면 manner_temperature / manner_score 레거시 환산
 */

import {
  clampTrustScore,
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
  TRUST_SCORE_DEFAULT,
} from "./trust-score-core";

export function legacyMannerFieldToTrustScore(raw: number): number {
  const x = Number(raw);
  if (!Number.isFinite(x)) return TRUST_SCORE_DEFAULT;
  const hasFraction = Math.abs(x - Math.trunc(x)) > 1e-6;
  let p: number;
  if (hasFraction && x > 0 && x <= KASAMA_LEGACY_TEMP_INPUT_MAX) {
    p = (x / KASAMA_LEGACY_TEMP_NEUTRAL) * KASAMA_NEUTRAL_BATTERY_PERCENT;
  } else {
    p = x;
  }
  return clampTrustScore(Math.round(Math.min(100, Math.max(0, p))));
}

export function resolveProfileTrustScore(row: Record<string, unknown> | null | undefined): number {
  if (!row) return TRUST_SCORE_DEFAULT;
  const ts = row.trust_score;
  if (ts != null && ts !== "") {
    const n = Number(ts);
    if (Number.isFinite(n)) return clampTrustScore(n);
  }
  const mt = row.manner_temperature;
  if (mt != null && mt !== "") {
    const n = Number(mt);
    if (Number.isFinite(n)) return legacyMannerFieldToTrustScore(n);
  }
  const ms = row.manner_score ?? row.temperature;
  if (ms != null && ms !== "") {
    const n = Number(ms);
    if (Number.isFinite(n)) return clampTrustScore(n);
  }
  return TRUST_SCORE_DEFAULT;
}
