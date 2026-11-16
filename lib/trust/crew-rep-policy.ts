/**
 * CREW REP — 정책 단일 정의 (crew_rep_v2 · Owner 2026-11-16 「S2 진행해」)
 *
 * 설계: docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md §4.2~§4.4, §7.4
 *
 *   축 X = 50 + 50 × (X⁺ − X⁻) / (X⁺ + X⁻ + K_X)
 *   CREW REP = 50 + 0.5(T−50) + 0.3(M−50) + 0.2(P−50) − S + 수동조정(±10)
 *              → 0~100, 이용 정지 중이면 최대 39
 *
 * 사건 1건 기여 = 기본점 × r(평가자 가중) × w(거래 확인 가중) × d(기간 가중)
 * 신고 「접수」는 점수 사건이 아니다(확정만). 같은 원장·정책·기준 시각 → 같은 점수.
 */

export const CREW_REP_POLICY_VERSION = "crew_rep_v2" as const;

export const CREW_REP_MIN = 0;
export const CREW_REP_MAX = 100;
export const CREW_REP_NEUTRAL = 50;

export type CrewRepAxis = "trade" | "manner" | "participation";

/** 축별 기준값 K — 클수록 천천히 오른다. */
export const CREW_REP_AXIS_K: Record<CrewRepAxis, number> = {
  trade: 10,
  manner: 20,
  participation: 40,
};

/** 축 가중 — 합 1.0. 참여만으로는 최대 +10(60점). */
export const CREW_REP_AXIS_WEIGHT: Record<CrewRepAxis, number> = {
  trade: 0.5,
  manner: 0.3,
  participation: 0.2,
};

/** 이용 정지 중 상한 (2단 「주의」 최댓값). */
export const CREW_REP_SUSPENSION_CAP = 39;

/** 운영 수동 조정 합계 절대값 상한. */
export const CREW_REP_MANUAL_ADJUSTMENT_CAP = 10;

/** 기간 가중 d: 0~180일 ×1.0, 181~365일 ×0.5, 그 뒤 0. */
export const CREW_REP_WINDOW_DAYS = 365;
export const CREW_REP_DECAY_FULL_DAYS = 180;
export const CREW_REP_DECAY_HALF_MULT = 0.5;

/** 같은 두 회원 사이 거래 평가: 30일에 1회, 평생 3회. */
export const CREW_REP_PAIR_COOLDOWN_DAYS = 30;
export const CREW_REP_PAIR_LIFETIME_MAX = 3;

/** 참여도 주간 합계 상한(기본점 기준). */
export const CREW_REP_PARTICIPATION_WEEKLY_CAP = 5;

/** 깨끗한 활동 월 1회 가점 (매너 축). */
export const CREW_REP_CLEAN_MONTH_POINTS = 1.0;

/** 날짜·주·월 경계 = 필리핀 시간 (UTC+8). DB 값은 UTC 그대로. */
export const CREW_REP_TZ_OFFSET_MINUTES = 8 * 60;

/** 평가자 가중 r 규칙. */
export const CREW_REP_RATER = {
  fullMinAccountDays: 14,
  zeroMaxAccountDays: 3,
  fullMinScore: 40,
  zeroBelowScore: 20,
  /** 아쉬워요를 자주 주는 평가자: 준 평가 5건 이상 중 60% 이상이 아쉬워요면 아쉬워요 ×0.5 */
  harshMinRatings: 5,
  harshBadRatio: 0.6,
  harshMult: 0.5,
  /** 서로만 주고받는 고리: 양방향 좋아요 각 3회 이상 + 다른 평가자 없음 → ×0.25 */
  ringMinEachWay: 3,
  ringMult: 0.25,
  /** 평가자를 알 수 없는 옛 기록(legacy backfill) */
  unknownMult: 0.5,
} as const;

export type CrewRepEventRule = {
  axis: CrewRepAxis | "sanction" | "ops" | "none";
  /** +1 = 좋은 근거(X⁺), −1 = 나쁜 근거(X⁻) */
  sign: 1 | -1;
  /** 기본점 (sanction 은 직접 감점) */
  points: number;
  /** 평가자 가중 r 적용 (counterparty_id = 평가자/반응한 회원) */
  raterWeighted: boolean;
  /** 같은 두 회원 30일 1회·평생 3회 (거래 평가) */
  pairRule?: boolean;
  /** 하루(PHT) 인정 개수 상한 */
  dailyCount?: number;
  /** 하루(PHT) 인정 기본점 상한 */
  dailyPoints?: number;
  /** 같은 원천(metadata.target_id: 글 등) 기본점 상한 */
  perTargetPoints?: number;
  /** 같은 원천·같은 반응자 1회 (metadata.target_id + counterparty_id) */
  oncePerTargetCounterparty?: boolean;
  /** 깨끗한 활동 월 판정용 「확인된 상호작용」 */
  interaction?: boolean;
  /** 깨끗한 활동 월을 깨는 「확정 위반」 */
  violation?: boolean;
};

const TRADE_RATING_GOOD: CrewRepEventRule = { axis: "trade", sign: 1, points: 1.0, raterWeighted: true, pairRule: true, interaction: true };
const TRADE_RATING_NORMAL: CrewRepEventRule = { axis: "trade", sign: 1, points: 0.2, raterWeighted: true, pairRule: true, interaction: true };
const TRADE_RATING_BAD: CrewRepEventRule = { axis: "trade", sign: -1, points: 1.0, raterWeighted: true, pairRule: true, interaction: true };

/**
 * 사건 종류별 규칙. 여기 없는 종류는 점수 0(기록만).
 * `trade_review_*` 는 v1 원장 이름 — v2 거래 평가와 같은 규칙(w = 1.0, 구매 확정 흐름 기록).
 */
export const CREW_REP_EVENT_RULES: Readonly<Record<string, CrewRepEventRule>> = {
  // T 거래 신뢰
  trade_rating_good: TRADE_RATING_GOOD,
  trade_rating_normal: TRADE_RATING_NORMAL,
  trade_rating_bad: TRADE_RATING_BAD,
  trade_review_good: TRADE_RATING_GOOD,
  trade_review_normal: TRADE_RATING_NORMAL,
  trade_review_bad: TRADE_RATING_BAD,
  trade_fraud_confirmed: { axis: "trade", sign: -1, points: 3.0, raterWeighted: false, violation: true },
  /** v1 거래 완료(구매 확정) — v2 점수 0, 깨끗한 활동 월의 상호작용으로만 인정 */
  trade_completed: { axis: "none", sign: 1, points: 0, raterWeighted: false, interaction: true },

  // M 매너·약속
  manner_moim_attended: { axis: "manner", sign: 1, points: 0.5, raterWeighted: false, dailyCount: 1, interaction: true },
  manner_moim_no_show: { axis: "manner", sign: -1, points: 2.0, raterWeighted: false, violation: true },
  manner_order_no_show: { axis: "manner", sign: -1, points: 2.0, raterWeighted: false, violation: true },
  manner_report_confirmed: { axis: "manner", sign: -1, points: 2.0, raterWeighted: false, violation: true },
  manner_false_report: { axis: "manner", sign: -1, points: 2.0, raterWeighted: false, violation: true },

  // P 참여도 (감점 없음)
  participation_post: { axis: "participation", sign: 1, points: 0.5, raterWeighted: false, dailyCount: 2, interaction: true },
  participation_comment_received: {
    axis: "participation",
    sign: 1,
    points: 0.1,
    raterWeighted: true,
    perTargetPoints: 1.0,
    oncePerTargetCounterparty: true,
    interaction: true,
  },
  participation_comment_written: { axis: "participation", sign: 1, points: 0.1, raterWeighted: false, dailyCount: 5, interaction: true },
  participation_like_received: {
    axis: "participation",
    sign: 1,
    points: 0.05,
    raterWeighted: true,
    dailyPoints: 1.0,
    oncePerTargetCounterparty: true,
    interaction: true,
  },
  participation_store_review: { axis: "participation", sign: 1, points: 0.3, raterWeighted: false, dailyCount: 2, interaction: true },

  // S 확정 제재 (직접 감점)
  sanction_warning: { axis: "sanction", sign: -1, points: 3, raterWeighted: false, violation: true },
  sanction_restriction: { axis: "sanction", sign: -1, points: 8, raterWeighted: false, violation: true },
  sanction_suspension: { axis: "sanction", sign: -1, points: 15, raterWeighted: false, violation: true },

  // 운영 수동 조정 (metadata.adjustment)
  manual_adjustment: { axis: "ops", sign: 1, points: 0, raterWeighted: false },
};

/** `sanctions.sanction_type` → CREW REP 제재 사건 종류 (S4 기록기·평가자 정지 판정 공용). */
export function crewRepSanctionEventType(
  sanctionType: string
): "sanction_warning" | "sanction_restriction" | "sanction_suspension" | null {
  switch (sanctionType) {
    case "warning":
      return "sanction_warning";
    case "chat_ban":
    case "community_restriction":
      return "sanction_restriction";
    case "temp_suspend":
    case "permanent_ban":
      return "sanction_suspension";
    default:
      return null;
  }
}

export function buildCrewRepEventIdempotencyKey(eventType: string, sourceId: string, memberId: string): string {
  return `${eventType}:${sourceId}:${memberId}`;
}
