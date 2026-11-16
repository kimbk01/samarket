/**
 * CREW REP — 회원 평판 표시 단일 정의 (Owner 2026-11-16 「매너 배터리 → CREW REP」, S1).
 *
 * 설계: docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md §4.1·§4.2
 * - 표기: `82 / 100` 정수 · 가로 막대 · 등급 칩. `%`·배터리 아이콘 금지(기기 배터리와 혼동 — D7).
 * - 등급 6단(구간은 trust-score-core 와 동일): 위험·주의·보통·좋음·우수·최고. 시작 50 = 「보통」(회색, 경고색 아님 — D8).
 * - 점수 원천(계산기·스냅샷)은 그대로다. 이 파일은 화면 표시만 정한다.
 */

import { clampTrustScore, trustScoreToBatteryLevel } from "@/lib/trust/trust-score-core";

export type CrewRepTier = 1 | 2 | 3 | 4 | 5 | 6;

export type CrewRepTierDef = {
  tier: CrewRepTier;
  min: number;
  max: number;
  /** i18n 키 — 화면 문구는 키로만 */
  labelKey: `crew_rep_tier_${CrewRepTier}`;
  /** 막대·칩·숫자 색 (hex). 6단 = DIBAY 그린 `--sam-primary`. */
  color: string;
};

export const CREW_REP_TIERS: readonly CrewRepTierDef[] = [
  { tier: 1, min: 0, max: 19, labelKey: "crew_rep_tier_1", color: "#d45252" },
  { tier: 2, min: 20, max: 39, labelKey: "crew_rep_tier_2", color: "#E07B39" },
  { tier: 3, min: 40, max: 59, labelKey: "crew_rep_tier_3", color: "#8A94A0" },
  { tier: 4, min: 60, max: 74, labelKey: "crew_rep_tier_4", color: "#5E9E3A" },
  { tier: 5, min: 75, max: 89, labelKey: "crew_rep_tier_5", color: "#21885d" },
  { tier: 6, min: 90, max: 100, labelKey: "crew_rep_tier_6", color: "#0B421A" },
] as const;

export const CREW_REP_MAX = 100;

/** 화면 정수 점수 (0~100). 계산 원값은 소수 2자리까지 저장되어 있다. */
export function crewRepDisplayScore(raw: number): number {
  return Math.round(clampTrustScore(raw));
}

export function crewRepTier(raw: number): CrewRepTier {
  return trustScoreToBatteryLevel(crewRepDisplayScore(raw));
}

export function crewRepTierDef(tier: CrewRepTier): CrewRepTierDef {
  return CREW_REP_TIERS[tier - 1]!;
}

export type CrewRepView = {
  /** 화면 정수 점수 */
  score: number;
  tier: CrewRepTier;
  color: string;
  labelKey: CrewRepTierDef["labelKey"];
};

export function buildCrewRepView(raw: number): CrewRepView {
  const score = crewRepDisplayScore(raw);
  const def = crewRepTierDef(trustScoreToBatteryLevel(score));
  return { score, tier: def.tier, color: def.color, labelKey: def.labelKey };
}
