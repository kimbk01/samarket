/**
 * CREW REP 화면 문구 키 매핑 — 사건 종류·0 처리 사유·이력 원인·축 (S6). 문구는 카탈로그(mypage-hub)에만.
 */

export const CREW_REP_EVENT_LABEL_KEYS = {
  trade_rating_good: "crew_rep_event_rating_good",
  trade_rating_normal: "crew_rep_event_rating_normal",
  trade_rating_bad: "crew_rep_event_rating_bad",
  trade_review_good: "crew_rep_event_rating_good",
  trade_review_normal: "crew_rep_event_rating_normal",
  trade_review_bad: "crew_rep_event_rating_bad",
  trade_fraud_confirmed: "crew_rep_event_trade_fraud",
  trade_completed: "crew_rep_event_trade_completed",
  manner_moim_attended: "crew_rep_event_moim_attended",
  manner_moim_no_show: "crew_rep_event_moim_no_show",
  manner_order_no_show: "crew_rep_event_order_no_show",
  manner_report_confirmed: "crew_rep_event_report_confirmed",
  manner_false_report: "crew_rep_event_false_report",
  participation_post: "crew_rep_event_post",
  participation_comment_received: "crew_rep_event_comment_received",
  participation_comment_written: "crew_rep_event_comment_written",
  participation_like_received: "crew_rep_event_like_received",
  participation_store_review: "crew_rep_event_store_review",
  sanction_warning: "crew_rep_event_sanction_warning",
  sanction_restriction: "crew_rep_event_sanction_restriction",
  sanction_suspension: "crew_rep_event_sanction_suspension",
  manual_adjustment: "crew_rep_event_manual_adjustment",
  clean_month: "crew_rep_event_clean_month",
} as const;

export const CREW_REP_ZERO_REASON_KEYS = {
  reversed: "crew_rep_zero_reversed",
  future: "crew_rep_zero_future",
  expired: "crew_rep_zero_expired",
  rater_weight_zero: "crew_rep_zero_rater",
  pair_cooldown: "crew_rep_zero_pair_cooldown",
  pair_lifetime: "crew_rep_zero_pair_lifetime",
  daily_cap: "crew_rep_zero_daily_cap",
  weekly_cap: "crew_rep_zero_weekly_cap",
  per_target_cap: "crew_rep_zero_per_target_cap",
  duplicate_reaction: "crew_rep_zero_duplicate",
  not_scored: "crew_rep_zero_not_scored",
} as const;

export const CREW_REP_CAUSE_KEYS = {
  event: "crew_rep_cause_event",
  reversal: "crew_rep_cause_reversal",
  admin: "crew_rep_cause_admin",
  daily_recompute: "crew_rep_cause_daily",
  policy_migration: "crew_rep_cause_policy",
  carry: "crew_rep_cause_carry",
} as const;

export const CREW_REP_AXIS_KEYS = {
  trade: "crew_rep_axis_trade",
  manner: "crew_rep_axis_manner",
  participation: "crew_rep_axis_participation",
  sanction: "crew_rep_axis_sanction",
  ops: "crew_rep_axis_ops",
  none: "crew_rep_axis_none",
} as const;

export function crewRepEventLabelKey(eventType: string) {
  return (CREW_REP_EVENT_LABEL_KEYS as Record<string, (typeof CREW_REP_EVENT_LABEL_KEYS)[keyof typeof CREW_REP_EVENT_LABEL_KEYS]>)[eventType] ??
    "crew_rep_event_other";
}
export function crewRepZeroReasonKey(reason: string) {
  return (CREW_REP_ZERO_REASON_KEYS as Record<string, (typeof CREW_REP_ZERO_REASON_KEYS)[keyof typeof CREW_REP_ZERO_REASON_KEYS]>)[reason] ??
    "crew_rep_zero_not_scored";
}
export function crewRepCauseKey(cause: string) {
  return (CREW_REP_CAUSE_KEYS as Record<string, (typeof CREW_REP_CAUSE_KEYS)[keyof typeof CREW_REP_CAUSE_KEYS]>)[cause] ?? "crew_rep_cause_event";
}
export function crewRepAxisKey(axis: string) {
  return (CREW_REP_AXIS_KEYS as Record<string, (typeof CREW_REP_AXIS_KEYS)[keyof typeof CREW_REP_AXIS_KEYS]>)[axis] ?? "crew_rep_axis_none";
}
