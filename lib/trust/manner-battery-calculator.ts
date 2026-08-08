/**
 * DIBAY Manner Battery — deterministic calculator (manner_trade_v1)
 *
 * score = clamp(
 *   NEUTRAL
 *   + AMPLITUDE * (pos - BAD_WEIGHT * neg) / (pos + BAD_WEIGHT * neg + PRIOR)
 *   + Σ manual_adjustment
 * )
 *
 * pos = trade_completed + trade_review_good
 * neg = trade_review_bad
 * normal = counted for history/confidence display only (no direction)
 *
 * DO NOT: current_score + delta; legacy ×1.5; report penalty
 */

import {
  MANNER_CALC_AMPLITUDE,
  MANNER_CALC_BAD_WEIGHT,
  MANNER_CALC_PRIOR,
  MANNER_POLICY_VERSION,
  MANNER_SCORE_MAX,
  MANNER_SCORE_MIN,
  MANNER_SCORE_NEUTRAL,
  MANNER_V1_SCORE_ELIGIBLE_TYPES,
  MANNER_WINDOW_DAYS,
  type TrustEventType,
} from "@/lib/trust/manner-battery-policy-v1";

export type CalculatorTrustEvent = {
  id: string;
  member_id: string;
  domain: string;
  event_type: string;
  direction: string;
  status: string;
  occurred_at: string;
  counterparty_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MannerBatteryCalculation = {
  manner_battery_percent: number;
  policy_version: typeof MANNER_POLICY_VERSION;
  active_domains: string[];
  eligible_event_count: number;
  trade_completed_count: number;
  review_good_count: number;
  review_normal_count: number;
  review_bad_count: number;
  unique_counterparty_count: number;
  reliability_component: number;
  feedback_component: number;
  confidence: number;
  manual_adjustment_sum: number;
  window_started_at: string;
  calculated_as_of: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampMannerPercent(n: number): number {
  if (!Number.isFinite(n)) return MANNER_SCORE_NEUTRAL;
  return Math.min(MANNER_SCORE_MAX, Math.max(MANNER_SCORE_MIN, round2(n)));
}

function windowStartIso(asOf: Date): string {
  const ms = asOf.getTime() - MANNER_WINDOW_DAYS * 86400000;
  return new Date(ms).toISOString();
}

function isInWindow(occurredAt: string, windowStart: string, asOfIso: string): boolean {
  return occurredAt >= windowStart && occurredAt <= asOfIso;
}

/**
 * Pure calculator. Same ledger + policy + as_of → same result.
 */
export function calculateMannerBattery(input: {
  events: CalculatorTrustEvent[];
  asOf?: Date | string;
}): MannerBatteryCalculation {
  const asOfDate = input.asOf
    ? input.asOf instanceof Date
      ? input.asOf
      : new Date(input.asOf)
    : new Date();
  const asOfIso = asOfDate.toISOString();
  const windowStartedAt = windowStartIso(asOfDate);

  let tradeCompleted = 0;
  let reviewGood = 0;
  let reviewNormal = 0;
  let reviewBad = 0;
  let manualAdj = 0;
  let eligible = 0;
  const counterparties = new Set<string>();

  for (const ev of input.events) {
    if (ev.status !== "confirmed") continue;
    if (!isInWindow(ev.occurred_at, windowStartedAt, asOfIso)) continue;
    const type = ev.event_type as TrustEventType;
    if (!MANNER_V1_SCORE_ELIGIBLE_TYPES.has(type)) continue;

    // Domain gate: trade behavioral + platform ops only for v1
    if (type !== "manual_adjustment" && ev.domain !== "trade") continue;

    eligible += 1;

    if (type === "trade_completed") {
      tradeCompleted += 1;
      if (ev.counterparty_id) counterparties.add(ev.counterparty_id);
    } else if (type === "trade_review_good") {
      reviewGood += 1;
      if (ev.counterparty_id) counterparties.add(ev.counterparty_id);
    } else if (type === "trade_review_normal") {
      reviewNormal += 1;
      if (ev.counterparty_id) counterparties.add(ev.counterparty_id);
    } else if (type === "trade_review_bad") {
      reviewBad += 1;
      if (ev.counterparty_id) counterparties.add(ev.counterparty_id);
    } else if (type === "manual_adjustment") {
      const adj = Number((ev.metadata as { adjustment?: unknown } | null)?.adjustment);
      if (Number.isFinite(adj)) manualAdj += adj;
    }
  }

  const pos = tradeCompleted + reviewGood;
  const neg = reviewBad;
  const denom = pos + MANNER_CALC_BAD_WEIGHT * neg + MANNER_CALC_PRIOR;
  const evidenceRatio = (pos - MANNER_CALC_BAD_WEIGHT * neg) / denom;
  const behavioral = MANNER_SCORE_NEUTRAL + MANNER_CALC_AMPLITUDE * evidenceRatio;
  const percent = clampMannerPercent(behavioral + manualAdj);

  // Components for admin explainability (not separate authorities)
  const reliability = clampMannerPercent(
    MANNER_SCORE_NEUTRAL +
      MANNER_CALC_AMPLITUDE * (tradeCompleted / (tradeCompleted + MANNER_CALC_PRIOR))
  );
  const feedbackDenom = reviewGood + MANNER_CALC_BAD_WEIGHT * reviewBad + MANNER_CALC_PRIOR;
  const feedback = clampMannerPercent(
    MANNER_SCORE_NEUTRAL +
      MANNER_CALC_AMPLITUDE *
        ((reviewGood - MANNER_CALC_BAD_WEIGHT * reviewBad) / feedbackDenom)
  );
  const sample = tradeCompleted + reviewGood + reviewNormal + reviewBad;
  const confidence = round2(sample / (sample + MANNER_CALC_PRIOR));

  return {
    manner_battery_percent: percent,
    policy_version: MANNER_POLICY_VERSION,
    active_domains: ["trade"],
    eligible_event_count: eligible,
    trade_completed_count: tradeCompleted,
    review_good_count: reviewGood,
    review_normal_count: reviewNormal,
    review_bad_count: reviewBad,
    unique_counterparty_count: counterparties.size,
    reliability_component: reliability,
    feedback_component: feedback,
    confidence,
    manual_adjustment_sum: round2(manualAdj),
    window_started_at: windowStartedAt,
    calculated_as_of: asOfIso,
  };
}
