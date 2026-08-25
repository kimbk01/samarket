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

export const STORE_COUPON_ISSUER_ROLES = ["owner", "admin", "system"] as const;
export type StoreCouponIssuerRole = (typeof STORE_COUPON_ISSUER_ROLES)[number];

export const STORE_COUPON_CAMPAIGN_PURPOSES = [
  "new_customer_acquisition",
  "repeat_purchase",
  "new_menu_promotion",
  "store_promotion",
  "platform_event",
] as const;
export type StoreCouponCampaignPurpose = (typeof STORE_COUPON_CAMPAIGN_PURPOSES)[number];

export function isStoreCouponIssuerRole(v: unknown): v is StoreCouponIssuerRole {
  return (STORE_COUPON_ISSUER_ROLES as readonly string[]).includes(String(v));
}

export function isStoreCouponCampaignPurpose(v: unknown): v is StoreCouponCampaignPurpose {
  return (STORE_COUPON_CAMPAIGN_PURPOSES as readonly string[]).includes(String(v));
}

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

export const OWNER_SELF_ISSUED_FUNDING_FORBIDDEN = "owner_funding_forbidden" as const;
export const ADMIN_SUPPORTED_FUNDING_FORBIDDEN = "admin_funding_forbidden" as const;
export const ADMIN_SHARED_SHARE_REQUIRED = "admin_shared_share_required" as const;

export type OwnerSelfIssuedFundingWrite = {
  funding_mode: "STORE_FUNDED";
  requires_admin_approval: false;
  store_funded_amount: null;
};

/** Owner create only. Tampered PLATFORM/SHARED/arbitrary must not write. */
export function resolveOwnerSelfIssuedCreateFunding(
  body: Record<string, unknown>
):
  | { ok: true; write: OwnerSelfIssuedFundingWrite }
  | { ok: false; error: typeof OWNER_SELF_ISSUED_FUNDING_FORBIDDEN } {
  const raw = body.fundingMode ?? body.funding_mode;
  if (raw == null || raw === "") {
    return {
      ok: true,
      write: {
        funding_mode: "STORE_FUNDED",
        requires_admin_approval: false,
        store_funded_amount: null,
      },
    };
  }
  if (String(raw) === "STORE_FUNDED") {
    return {
      ok: true,
      write: {
        funding_mode: "STORE_FUNDED",
        requires_admin_approval: false,
        store_funded_amount: null,
      },
    };
  }
  return { ok: false, error: OWNER_SELF_ISSUED_FUNDING_FORBIDDEN };
}

export type AdminSupportedFundingWrite =
  | {
      funding_mode: "PLATFORM_FUNDED";
      requires_admin_approval: false;
      store_funded_amount: null;
    }
  | {
      funding_mode: "SHARED_FUNDED";
      requires_admin_approval: false;
      store_funded_amount: number;
    };

/** Admin create only. STORE / omit / tamper must not write. Owner resolver stays untouched. */
export function resolveAdminSupportedCreateFunding(
  body: Record<string, unknown>
):
  | { ok: true; write: AdminSupportedFundingWrite }
  | {
      ok: false;
      error: typeof ADMIN_SUPPORTED_FUNDING_FORBIDDEN | typeof ADMIN_SHARED_SHARE_REQUIRED;
    } {
  const raw = body.fundingMode ?? body.funding_mode;
  if (String(raw) === "PLATFORM_FUNDED") {
    return {
      ok: true,
      write: {
        funding_mode: "PLATFORM_FUNDED",
        requires_admin_approval: false,
        store_funded_amount: null,
      },
    };
  }
  if (String(raw) === "SHARED_FUNDED") {
    const shareRaw = body.storeFundedAmount ?? body.store_funded_amount;
    const share =
      typeof shareRaw === "number"
        ? shareRaw
        : typeof shareRaw === "string" && shareRaw.trim()
          ? Number(shareRaw)
          : NaN;
    if (!Number.isFinite(share) || share < 0) {
      return { ok: false, error: ADMIN_SHARED_SHARE_REQUIRED };
    }
    return {
      ok: true,
      write: {
        funding_mode: "SHARED_FUNDED",
        requires_admin_approval: false,
        store_funded_amount: Math.floor(share),
      },
    };
  }
  return { ok: false, error: ADMIN_SUPPORTED_FUNDING_FORBIDDEN };
}
