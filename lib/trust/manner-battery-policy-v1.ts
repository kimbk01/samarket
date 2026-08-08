/**
 * DIBAY Manner Battery — Policy SSOT (manner_trade_v1)
 *
 * CONTRACT:
 * - Architecture domains: trade | community | delivery | platform
 * - Scoring v1: TRADE ACTIVE only; community/delivery INACTIVE (no invented weights)
 * - NO DATA ≠ BAD TRUST
 * - REPORT_CREATED / pending dispute ≠ score eligible
 * - Legacy TRUST_EVENT_DELTAS / ×1.5 / report=-5 are NOT authority
 */

export const MANNER_POLICY_VERSION = "manner_trade_v1" as const;

export const MANNER_SCORE_MIN = 0;
export const MANNER_SCORE_MAX = 100;
export const MANNER_SCORE_NEUTRAL = 50;

/** Scoring eligibility window (days). Recency multiplier inside window = 1.0 for v1. */
export const MANNER_WINDOW_DAYS = 365;
export const MANNER_RECENCY_MULTIPLIER_V1 = 1.0;

/**
 * Calculator params (bounded_evidence_ratio).
 * Product rationale — NOT copied from legacy deltas or Model B/C simulation numbers:
 * - amplitude 50: full span around neutral → theoretical 0..100
 * - prior 5: single clean completion moves modestly (~+8), not a jump to high trust
 * - bad_weight 0.5: bad review is LOW severity vs one positive unit
 */
export const MANNER_CALC_AMPLITUDE = 50;
export const MANNER_CALC_PRIOR = 5;
export const MANNER_CALC_BAD_WEIGHT = 0.5;

export type TrustDomain = "trade" | "community" | "delivery" | "platform";

export type TrustEventType =
  | "trade_completed"
  | "trade_review_good"
  | "trade_review_normal"
  | "trade_review_bad"
  | "manual_adjustment"
  | "community_positive_trust"
  | "community_negative_trust"
  | "community_confirmed_violation"
  | "delivery_member_abuse_confirmed"
  | "delivery_member_commitment_kept";

export type TrustDirection = "positive" | "neutral" | "negative" | "ops";
export type TrustSeverity = "none" | "low" | "medium" | "high" | "critical";
export type TrustEventStatus = "confirmed" | "reversed";

export const MANNER_DOMAIN_ACTIVITY = {
  trade: true,
  community: false,
  delivery: false,
  platform: true, // ops corrections only; not a weighted domain
} as const;

/** Event types that contribute to behavioral score under manner_trade_v1. */
export const MANNER_V1_SCORE_ELIGIBLE_TYPES = new Set<TrustEventType>([
  "trade_completed",
  "trade_review_good",
  "trade_review_normal",
  "trade_review_bad",
  "manual_adjustment",
]);

/** Explicitly never score-eligible (even if somehow inserted). */
export const MANNER_NEVER_SCORE_ELIGIBLE = new Set<string>([
  "report_created",
  "dispute_hold",
  "pending_dispute",
  "community_post",
  "community_like",
  "delivery_order_completed",
  "delivery_order_cancelled",
  "store_rating",
]);

export function buildTradeCompletedIdempotencyKey(productChatId: string, memberId: string): string {
  return `trade_completed:${productChatId}:${memberId}`;
}

export function buildTradeReviewIdempotencyKey(reviewId: string, targetMemberId: string): string {
  return `trade_review:${reviewId}:${targetMemberId}`;
}

export function buildManualAdjustmentIdempotencyKey(adjustmentId: string, memberId: string): string {
  return `manual_adjustment:${adjustmentId}:${memberId}`;
}

export function buildReversalIdempotencyKey(originalEventId: string): string {
  return `reversal:${originalEventId}`;
}
