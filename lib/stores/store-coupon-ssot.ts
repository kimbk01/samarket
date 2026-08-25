/**
 * FREE COUPON SSOT — CUT 0 domain lock.
 * Paid voucher / instant discount / multi-coupon stack are OUT of this module.
 */

export const STORE_COUPON_FUNDING_MODES = [
  "STORE_FUNDED",
  "PLATFORM_FUNDED",
  "SHARED_FUNDED",
] as const;
export type StoreCouponFundingMode = (typeof STORE_COUPON_FUNDING_MODES)[number];

export const STORE_COUPON_LIFECYCLE_STATES = [
  "draft",
  "requested",
  "approved",
  "rejected",
  "scheduled",
  "active",
  "paused",
  "ended",
  "revoked",
] as const;
export type StoreCouponLifecycleState = (typeof STORE_COUPON_LIFECYCLE_STATES)[number];

export const STORE_COUPON_ENTITLEMENT_STATES = [
  "available",
  "redeemed",
  "expired",
  "revoked",
  "restored",
] as const;
export type StoreCouponEntitlementState = (typeof STORE_COUPON_ENTITLEMENT_STATES)[number];

export const STORE_COUPON_FIRST_ORDER_SCOPES = ["STORE", "PLATFORM"] as const;
export type StoreCouponFirstOrderScope = (typeof STORE_COUPON_FIRST_ORDER_SCOPES)[number];

export const COUPON_USER_ENTITLEMENTS_TABLE = "coupon_user_entitlements" as const;
export const COUPON_AUDIT_EVENTS_TABLE = "coupon_audit_events" as const;

export const PAID_VOUCHER_IMPLEMENTATION_BLOCKED = true as const;

export function isStoreCouponFundingMode(v: unknown): v is StoreCouponFundingMode {
  return (
    v === "STORE_FUNDED" || v === "PLATFORM_FUNDED" || v === "SHARED_FUNDED"
  );
}

export function isStoreCouponLifecycleState(v: unknown): v is StoreCouponLifecycleState {
  return (STORE_COUPON_LIFECYCLE_STATES as readonly string[]).includes(String(v));
}

/** Claimed entitlements remain valid. New claims denied. */
export function couponLifecycleAllowsNewClaim(state: StoreCouponLifecycleState): boolean {
  return state === "active" || state === "scheduled";
}

export function couponLifecycleAllowsRedeemHeld(state: StoreCouponLifecycleState): boolean {
  return state !== "revoked";
}

export function isPaidCouponTypeForbidden(type: unknown): boolean {
  return type === "paid" || type === "voucher";
}
