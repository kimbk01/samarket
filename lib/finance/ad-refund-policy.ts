/**
 * Ad refund policy — AD-P0-2 LOCK.
 * NORMAL EXPIRY = NO REFUND.
 */
import {
  AD_NORMAL_EXPIRY_REFUND,
  AD_REFUND_ALLOWED_REASONS,
  type AdRefundAllowedReason,
} from "@/lib/finance/product-decision-lock";

export type AdLifecycleFundingPhase =
  | "HOLD"
  | "CAPTURE"
  | "IMMEDIATE_DEBIT"
  | "SECURED_CASH"
  | "ADMIN_DIRECT_NONE"
  | "RELEASED"
  | "REFUNDED"
  | "EXPIRED";

const NORMAL_EXPIRY_REASONS = new Set([
  "expired",
  "normal_expiry",
  "period_end",
  "ended",
  "expiry",
]);

/** True only for explicit failure/cancel paths — never for normal expiry. */
export function mayRefundAdFunding(reason: string): boolean {
  if (AD_NORMAL_EXPIRY_REFUND) return true;
  const r = String(reason ?? "").trim().toLowerCase();
  if (NORMAL_EXPIRY_REASONS.has(r)) return false;
  return (AD_REFUND_ALLOWED_REASONS as readonly string[]).includes(reason);
}

export function assertNotNormalExpiryRefund(reason: string):
  | { ok: true }
  | { ok: false; error: "normal_expiry_no_refund" } {
  const r = String(reason ?? "").trim().toLowerCase();
  if (NORMAL_EXPIRY_REASONS.has(r)) {
    return { ok: false, error: "normal_expiry_no_refund" };
  }
  return { ok: true };
}

export function isAllowedAdRefundReason(reason: string): reason is AdRefundAllowedReason {
  return (AD_REFUND_ALLOWED_REASONS as readonly string[]).includes(reason);
}

export function describeBoostFundingLifecycle(): AdLifecycleFundingPhase[] {
  return ["IMMEDIATE_DEBIT", "EXPIRED"];
}

export function describeMemberBannerFundingLifecycle(): AdLifecycleFundingPhase[] {
  return ["HOLD", "CAPTURE", "EXPIRED"];
}

export function describeMemberBannerRejectLifecycle(): AdLifecycleFundingPhase[] {
  return ["HOLD", "RELEASED"];
}
