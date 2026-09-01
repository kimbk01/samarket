/**
 * PAID GIFT CERTIFICATE — G1 Domain Contract (DESIGN_LOCKED from G0).
 *
 * CODE CHANGE SCOPE (G1): types · constants · pure validators · pure calculators.
 * FORBIDDEN in G1: migrations · tables · RPC · API · UI · Messenger · Checkout prod · archived store-cash DB.
 *
 * HARD BOUNDARIES:
 * - Free Coupon = discount entitlement (store-coupon-ssot) — never merge.
 * - Paid Gift = scope-aware stored-value payment asset (STORE | PLATFORM).
 * - Member Point = Gift Mall purchase rail only (not delivery checkout).
 * - Archived store-credit schema (`stores.point_balance`) is not Gift Revenue.
 * - store_settlements = order accounting ≠ Gift Revenue.
 * - `STORE_CASH_*` names below preserve archived schema compatibility only; they do not define a product.
 */

import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";
import {
  PAID_VOUCHER_IMPLEMENTATION_BLOCKED,
  isPaidCouponTypeForbidden,
} from "@/lib/stores/store-coupon-ssot";

// ─── Product / domain locks ─────────────────────────────────────────────────

export const GIFT_CERTIFICATE_DOMAIN = "paid_gift_certificate" as const;

/** Gift is never a Coupon campaign / discount_type. */
export const GIFT_IS_NOT_COUPON = true as const;

/** Paid Gift may carry product expiry policy → instance valid_until snapshot (Expiry ON). */
export const GIFT_INSTANCE_EXPIRY_DISABLED = false as const;
/** Balance expiry follows instance valid_until (null = no expiry). */
export const GIFT_BALANCE_EXPIRY_DISABLED = true as const;

/** Sales campaign window is allowed; distinct from certificate validity. */
export const GIFT_SALES_WINDOW_ALLOWED = true as const;

/** DB storage enums (migration 20261128200000). */
export const GIFT_EXPIRY_POLICIES = ["NO_EXPIRY", "FIXED_DAYS", "FIXED_DATE"] as const;
export type GiftExpiryPolicy = (typeof GIFT_EXPIRY_POLICIES)[number];

/** FINAL Design Lock aliases → DB storage. */
export const GIFT_EXPIRY_POLICY_ALIASES: Record<string, GiftExpiryPolicy> = {
  NO_EXPIRY: "NO_EXPIRY",
  FIXED_DAYS: "FIXED_DAYS",
  FIXED_DATE: "FIXED_DATE",
  VALID_DAYS_AFTER_ISSUE: "FIXED_DAYS",
  FIXED_UNTIL: "FIXED_DATE",
};

export function isGiftExpiryPolicy(v: unknown): v is GiftExpiryPolicy {
  return typeof v === "string" && (GIFT_EXPIRY_POLICIES as readonly string[]).includes(v);
}

export function normalizeGiftExpiryPolicy(raw: unknown): GiftExpiryPolicy | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toUpperCase();
  const mapped = GIFT_EXPIRY_POLICY_ALIASES[key];
  return mapped ?? null;
}

export function validateGiftProductExpiryPolicy(input: {
  expiryPolicy: unknown;
  validityDays?: unknown;
  fixedValidUntil?: unknown;
}):
  | { ok: true; expiryPolicy: GiftExpiryPolicy; validityDays: number | null; fixedValidUntil: string | null }
  | { ok: false; error: string } {
  const expiryPolicy = normalizeGiftExpiryPolicy(input.expiryPolicy);
  if (!expiryPolicy) return { ok: false, error: "invalid_expiry_policy" };

  if (expiryPolicy === "NO_EXPIRY") {
    return { ok: true, expiryPolicy, validityDays: null, fixedValidUntil: null };
  }

  if (expiryPolicy === "FIXED_DAYS") {
    const days = Math.trunc(Number(input.validityDays));
    if (!Number.isFinite(days) || days <= 0) return { ok: false, error: "invalid_validity_days" };
    return { ok: true, expiryPolicy, validityDays: days, fixedValidUntil: null };
  }

  const until = typeof input.fixedValidUntil === "string" ? input.fixedValidUntil.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: "invalid_fixed_valid_until" };
  return { ok: true, expiryPolicy, validityDays: null, fixedValidUntil: until };
}

/** Owner cannot self-issue sellable products — Admin approve/create only. */
export const GIFT_ADMIN_ISSUED_ONLY = true as const;

/** Default product.transferable when Admin does not override. */
export const GIFT_TRANSFERABLE_DEFAULT = true as const;

/** @deprecated Prefer GiftScope — STORE gifts remain same-store; PLATFORM is multi-store. */
export const GIFT_STORE_SCOPED = true as const;

export const GIFT_SCOPES = ["STORE", "PLATFORM"] as const;
export type GiftScope = (typeof GIFT_SCOPES)[number];

export const GIFT_CREATION_SOURCES = [
  "OWNER_APPLICATION",
  "ADMIN_DIRECT_STORE",
  "ADMIN_DIRECT_PLATFORM",
] as const;
export type GiftCreationSource = (typeof GIFT_CREATION_SOURCES)[number];

export function isGiftScope(v: unknown): v is GiftScope {
  return v === "STORE" || v === "PLATFORM";
}

export function isGiftCreationSource(v: unknown): v is GiftCreationSource {
  return (
    v === "OWNER_APPLICATION" ||
    v === "ADMIN_DIRECT_STORE" ||
    v === "ADMIN_DIRECT_PLATFORM"
  );
}

/** STORE requires store_id; PLATFORM forbids store_id as redeem scope. */
export function assertGiftScopeStoreId(
  scope: GiftScope,
  storeId: string | null | undefined
): { ok: true } | { ok: false; error: "store_id_required" | "store_id_forbidden" } {
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (scope === "STORE") {
    if (!id) return { ok: false, error: "store_id_required" };
    return { ok: true };
  }
  if (id) return { ok: false, error: "store_id_forbidden" };
  return { ok: true };
}

/** Checkout redeem gate by explicit gift_scope (never infer from null alone). */
export function giftInstanceAllowsCheckoutStore(args: {
  giftScope: GiftScope | string | null | undefined;
  instanceStoreId: string | null | undefined;
  checkoutStoreId: string;
}): boolean {
  const checkout = args.checkoutStoreId.trim();
  if (!checkout) return false;
  const scope = isGiftScope(args.giftScope) ? args.giftScope : "STORE";
  if (scope === "PLATFORM") return true;
  const issuer = typeof args.instanceStoreId === "string" ? args.instanceStoreId.trim() : "";
  return Boolean(issuer) && issuer === checkout;
}

export function resolveGiftCreationSource(args: {
  giftScope: GiftScope;
  applicationId?: string | null;
}): GiftCreationSource {
  if (args.giftScope === "PLATFORM") return "ADMIN_DIRECT_PLATFORM";
  const appId = typeof args.applicationId === "string" ? args.applicationId.trim() : "";
  if (appId) return "OWNER_APPLICATION";
  return "ADMIN_DIRECT_STORE";
}

export const GIFT_PARTIAL_REDEMPTION_SUPPORTED = true as const;

/** History retained after FULLY_REDEEMED — never delete instance rows (G2+). */
export const GIFT_FULLY_REDEEMED_HISTORY_RETAINED = true as const;
export const GIFT_FULLY_REDEEMED_DELETE_FORBIDDEN = true as const;

// ─── Checkout / purchase rails ──────────────────────────────────────────────

/** Gift redemption is payment reduction, not discount_amount. */
export const GIFT_IS_NOT_DISCOUNT = true as const;

/** Coupon discount is applied before gift redemption in the calculation order. */
export const GIFT_AFTER_COUPON_IN_CHECKOUT_CALC = true as const;

/** Initial product flag — schema (G2) must still allow 1:N redemptions. */
export const GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL = 1 as const;
export const GIFT_REDEMPTION_ORDER_RELATION_ALLOWS_1_TO_N = true as const;

/** Canonical purchase rail. */
export const GIFT_PURCHASE_PAYMENT_RAIL = "d_point" as const;
export const GIFT_DIRECT_GCASH_BANK_PURCHASE_DISABLED = true as const;
export const GIFT_POINT_P2P_DISABLED = true as const;

/** Delivery checkout must not gain Point because of Gift. */
export const GIFT_DELIVERY_CHECKOUT_DPOINT_REMAINS =
  STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported === false;

// ─── Revenue recognition ────────────────────────────────────────────────────

/** Owner + platform fee recognized when linked store order reaches terminal `completed`. */
export const GIFT_OWNER_REVENUE_RECOGNITION = "order_completion" as const;
export const GIFT_PLATFORM_FEE_RECOGNITION = "order_completion" as const;
export const GIFT_REDEEM_TIME_OWNER_AVAILABLE_FORBIDDEN = true as const;
export const GIFT_SALE_TIME_OWNER_REVENUE_FORBIDDEN = true as const;

/** Gift must never treat foreign or archived balance authorities as Gift Revenue. */
export const GIFT_FORBIDDEN_BALANCE_AUTHORITIES = [
  "stores.point_balance",
  "store_settlements",
  "profiles.points",
] as const;

export const GIFT_BUSINESS_CREDIT_FIELD = "stores.point_balance" as const;
export const GIFT_ORDER_SETTLEMENT_TABLE = "store_settlements" as const;

// ─── Money: integer minor units (PHP / points as trunc integers) ─────────────

export type GiftMoneyInt = number;

export function assertGiftMoneyInt(n: unknown): n is GiftMoneyInt {
  return typeof n === "number" && Number.isFinite(n) && Math.trunc(n) === n && n >= 0;
}

export function toGiftMoneyInt(n: unknown): GiftMoneyInt | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t !== n || t < 0) return null;
  return t;
}

export type GiftMoneyFields = {
  faceValue: GiftMoneyInt;
  purchasePrice: GiftMoneyInt;
  remainingBalance: GiftMoneyInt;
  redeemedAmount: GiftMoneyInt;
  platformFeeAmount: GiftMoneyInt;
  merchantNetAmount: GiftMoneyInt;
  giftRevenueAvailable: GiftMoneyInt;
  storeCashAmount: GiftMoneyInt;
};

// ─── Discount funding (face ≠ purchase) ─────────────────────────────────────

export const GIFT_DISCOUNT_FUNDING_PARTIES = [
  "NONE",
  "PLATFORM",
  "MERCHANT",
  "SHARED",
] as const;
export type GiftDiscountFundingParty = (typeof GIFT_DISCOUNT_FUNDING_PARTIES)[number];

export function isGiftDiscountFundingParty(v: unknown): v is GiftDiscountFundingParty {
  return (GIFT_DISCOUNT_FUNDING_PARTIES as readonly string[]).includes(String(v));
}

export type GiftProductFundingInput = {
  faceValue: GiftMoneyInt;
  purchasePrice: GiftMoneyInt;
  discountFundingParty: GiftDiscountFundingParty;
  platformFundedUnits?: GiftMoneyInt;
  merchantFundedUnits?: GiftMoneyInt;
};

export type GiftProductFundingValidation =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid_money"
        | "purchase_exceeds_face"
        | "funding_party_required"
        | "funding_party_must_be_none"
        | "shared_units_required"
        | "shared_units_mismatch"
        | "platform_units_required"
        | "merchant_units_required"
        | "units_mismatch";
    };

/**
 * Face may exceed purchase (promo). Gap must be funded explicitly.
 * Does not reduce redeemable face.
 */
export function validateGiftProductFunding(input: GiftProductFundingInput): GiftProductFundingValidation {
  const face = toGiftMoneyInt(input.faceValue);
  const price = toGiftMoneyInt(input.purchasePrice);
  if (face == null || price == null) return { ok: false, error: "invalid_money" };
  if (price > face) return { ok: false, error: "purchase_exceeds_face" };

  const gap = face - price;
  const party = input.discountFundingParty;

  if (gap === 0) {
    if (party !== "NONE") return { ok: false, error: "funding_party_must_be_none" };
    return { ok: true };
  }

  if (party === "NONE" || !isGiftDiscountFundingParty(party)) {
    return { ok: false, error: "funding_party_required" };
  }

  if (party === "PLATFORM") {
    const p = toGiftMoneyInt(input.platformFundedUnits ?? gap);
    if (p == null) return { ok: false, error: "platform_units_required" };
    if (p !== gap) return { ok: false, error: "units_mismatch" };
    if ((input.merchantFundedUnits ?? 0) !== 0 && input.merchantFundedUnits != null) {
      const m = toGiftMoneyInt(input.merchantFundedUnits);
      if (m != null && m !== 0) return { ok: false, error: "units_mismatch" };
    }
    return { ok: true };
  }

  if (party === "MERCHANT") {
    const m = toGiftMoneyInt(input.merchantFundedUnits ?? gap);
    if (m == null) return { ok: false, error: "merchant_units_required" };
    if (m !== gap) return { ok: false, error: "units_mismatch" };
    return { ok: true };
  }

  // SHARED
  const p = toGiftMoneyInt(input.platformFundedUnits);
  const m = toGiftMoneyInt(input.merchantFundedUnits);
  if (p == null || m == null) return { ok: false, error: "shared_units_required" };
  if (p + m !== gap) return { ok: false, error: "shared_units_mismatch" };
  return { ok: true };
}

// ─── Product logical shape (no persistence) ─────────────────────────────────

export type GiftProductContractFields = {
  storeId: string;
  faceValue: GiftMoneyInt;
  purchasePrice: GiftMoneyInt;
  /** 0–100 integer percent snapshot source; fixture only until G2 policy table. */
  platformFeeRate: GiftMoneyInt;
  feePolicyRef?: string | null;
  discountFundingParty: GiftDiscountFundingParty;
  platformFundedUnits: GiftMoneyInt;
  merchantFundedUnits: GiftMoneyInt;
  transferable: boolean;
  salesStartsAt: string | null;
  salesEndsAt: string | null;
  active: boolean;
};

/** Value-expiry fields are forbidden on Paid Gift contracts. */
export type GiftForbiddenExpiryFields = {
  expiresAt?: unknown;
  balanceExpiresAt?: unknown;
  valueExpiresAt?: unknown;
};

export function giftProductHasForbiddenExpiryField(input: GiftForbiddenExpiryFields): boolean {
  return (
    input.expiresAt != null ||
    input.balanceExpiresAt != null ||
    input.valueExpiresAt != null
  );
}

/**
 * Sales window end does NOT invalidate an already-issued instance.
 * Helper must never return false solely because salesEndsAt passed.
 */
export function isIssuedGiftInstanceStillValidAfterSalesEnd(args: {
  salesEndsAt: string | null | undefined;
  nowMs: number;
  instanceRemainingBalance: GiftMoneyInt;
  instanceStatus: GiftInstanceStatus;
}): boolean {
  void args.salesEndsAt;
  void args.nowMs;
  if (args.instanceRemainingBalance < 0) return false;
  if (args.instanceStatus === "SUSPENDED") return false;
  if (args.instanceStatus === "FULLY_REDEEMED") return args.instanceRemainingBalance === 0;
  return (
    args.instanceStatus === "ACTIVE" ||
    args.instanceStatus === "PARTIALLY_REDEEMED" ||
    args.instanceStatus === "GIFT_LOCKED"
  );
}

// ─── Instance status ────────────────────────────────────────────────────────

export const GIFT_INSTANCE_STATUSES = [
  "ACTIVE",
  "GIFT_LOCKED",
  "PARTIALLY_REDEEMED",
  "FULLY_REDEEMED",
  "SUSPENDED",
] as const;
export type GiftInstanceStatus = (typeof GIFT_INSTANCE_STATUSES)[number];

export function isGiftInstanceStatus(v: unknown): v is GiftInstanceStatus {
  return (GIFT_INSTANCE_STATUSES as readonly string[]).includes(String(v));
}

export function giftInstanceAllowsRedeem(status: GiftInstanceStatus): boolean {
  return status === "ACTIVE" || status === "PARTIALLY_REDEEMED";
}

export function giftInstanceAllowsRegift(status: GiftInstanceStatus, transferable: boolean): boolean {
  if (!transferable) return false;
  return status === "ACTIVE" || status === "PARTIALLY_REDEEMED";
}

export function resolveGiftInstanceStatusAfterRedeem(remainingAfter: GiftMoneyInt): GiftInstanceStatus {
  if (remainingAfter === 0) return "FULLY_REDEEMED";
  return "PARTIALLY_REDEEMED";
}

// ─── Transfer status ────────────────────────────────────────────────────────

export const GIFT_TRANSFER_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"] as const;
export type GiftTransferStatus = (typeof GIFT_TRANSFER_STATUSES)[number];

export function isGiftTransferStatus(v: unknown): v is GiftTransferStatus {
  return (GIFT_TRANSFER_STATUSES as readonly string[]).includes(String(v));
}

const TRANSFER_FROM_PENDING = new Set<GiftTransferStatus>(["ACCEPTED", "REJECTED", "CANCELLED"]);

export function canTransitionGiftTransfer(
  current: GiftTransferStatus,
  next: GiftTransferStatus
): boolean {
  if (current === next) return false;
  if (current !== "PENDING") return false;
  return TRANSFER_FROM_PENDING.has(next);
}

/** OFFER locks instance; PENDING blocks redeem and regift. */
export function giftPendingBlocksRedeem(instanceStatus: GiftInstanceStatus): boolean {
  return instanceStatus === "GIFT_LOCKED";
}

export function giftPendingBlocksRegift(instanceStatus: GiftInstanceStatus): boolean {
  return instanceStatus === "GIFT_LOCKED";
}

/** After ACCEPT, previous owner has no redeem/regift authority (conceptual). */
export function senderRetainsAuthorityAfterAccept(): boolean {
  return false;
}

// ─── Revenue status (projection labels — not money authority) ───────────────

/**
 * Revenue status labels are future ledger projections only.
 * Append-only Gift Revenue ledger (G2+) is the money authority.
 */
export const GIFT_REVENUE_STATUSES = [
  "PENDING",
  "AVAILABLE",
  "CONVERSION_REQUESTED",
  "CONVERTED",
  "REVERSED",
] as const;
export type GiftRevenueStatus = (typeof GIFT_REVENUE_STATUSES)[number];

export const GIFT_REVENUE_STATUS_IS_LEDGER_PROJECTION = true as const;

// ─── Archived store-cash schema identifiers (compatibility only) ────────────

export const STORE_CASH_LEDGER_SOURCE_TYPES = [
  "GIFT_REVENUE_CONVERSION",
  "GIFT_REDEMPTION_REVERSAL",
  "RECOVERY_CLEAR",
  "GIFT_RECOGNITION_CORRECTION",
  "AD_SPEND",
  "AD_REFUND",
] as const;
export type StoreCashLedgerSourceType = (typeof STORE_CASH_LEDGER_SOURCE_TYPES)[number];

/** External bank/GCash payout is out of Gift G1–G11 core destination scope. */
export const STORE_CASH_EXTERNAL_PAYOUT_IN_GIFT_SCOPE = false as const;

export const STORE_CASH_NEGATIVE_BALANCE_FORBIDDEN = true as const;

export const STORE_CASH_RECOVERY_STATUSES = ["OPEN", "PARTIALLY_CLEARED", "CLEARED"] as const;
export type StoreCashRecoveryStatus = (typeof STORE_CASH_RECOVERY_STATUSES)[number];

export function storeCashConversionApprovalAllowed(args: {
  openRecoveryObligationAmount: GiftMoneyInt;
}): boolean {
  return (toGiftMoneyInt(args.openRecoveryObligationAmount) ?? 0) === 0;
}

export function computeStoreCashRefundShortfall(args: {
  storeCashBalance: GiftMoneyInt;
  reversalAmount: GiftMoneyInt;
}): { debitCash: GiftMoneyInt; recoveryObligation: GiftMoneyInt } {
  const bal = toGiftMoneyInt(args.storeCashBalance) ?? 0;
  const rev = toGiftMoneyInt(args.reversalAmount) ?? 0;
  const debitCash = Math.min(bal, rev);
  const recoveryObligation = rev - debitCash;
  return { debitCash, recoveryObligation };
}

// ─── Friend eligibility (policy only — no DB in G1) ─────────────────────────

export type GiftFriendEligibilityInput = {
  senderUserId: string;
  recipientUserId: string;
  senderHasRecipientAsFriendContact: boolean;
  recipientActive: boolean;
  blockedEitherWay: boolean;
  recipientRestricted: boolean;
  chatDomainIsGeneralDirect: boolean;
};

export type GiftFriendEligibilityResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "self"
        | "not_friend_contact"
        | "recipient_inactive"
        | "blocked"
        | "restricted"
        | "not_general_direct";
    };

/**
 * Gift-only gate. Does not change Messenger messaging policy
 * (non-friends may still message when not blocked).
 */
export function evaluateGiftFriendEligibility(
  input: GiftFriendEligibilityInput
): GiftFriendEligibilityResult {
  const s = input.senderUserId.trim();
  const r = input.recipientUserId.trim();
  if (!s || !r || s === r) return { ok: false, error: "self" };
  if (!input.chatDomainIsGeneralDirect) return { ok: false, error: "not_general_direct" };
  if (input.blockedEitherWay) return { ok: false, error: "blocked" };
  if (input.recipientRestricted) return { ok: false, error: "restricted" };
  if (!input.recipientActive) return { ok: false, error: "recipient_inactive" };
  if (!input.senderHasRecipientAsFriendContact) return { ok: false, error: "not_friend_contact" };
  return { ok: true };
}

// ─── Redemption / fee pure calc ─────────────────────────────────────────────

export function computeGiftRedemptionSplit(args: {
  amountDueBeforeGift: GiftMoneyInt;
  giftRemaining: GiftMoneyInt;
}): {
  redeemAmount: GiftMoneyInt;
  remainingPayment: GiftMoneyInt;
  giftRemainingAfter: GiftMoneyInt;
} {
  const due = Math.max(0, Math.trunc(Number(args.amountDueBeforeGift) || 0));
  const rem = Math.max(0, Math.trunc(Number(args.giftRemaining) || 0));
  const redeemAmount = Math.min(due, rem);
  return {
    redeemAmount,
    remainingPayment: due - redeemAmount,
    giftRemainingAfter: rem - redeemAmount,
  };
}

/**
 * Checkout conceptual layers — coupon and gift never share one field.
 */
export function computeCheckoutLayersBeforeAndAfterGift(args: {
  itemGross: GiftMoneyInt;
  deliveryFee: GiftMoneyInt;
  couponDiscount: GiftMoneyInt;
  giftRedeemAmount: GiftMoneyInt;
}): {
  amountDueBeforeGift: GiftMoneyInt;
  couponDiscount: GiftMoneyInt;
  giftRedemption: GiftMoneyInt;
  remainingPayment: GiftMoneyInt;
} {
  const items = Math.max(0, Math.trunc(args.itemGross));
  const delivery = Math.max(0, Math.trunc(args.deliveryFee));
  const coupon = Math.max(0, Math.trunc(args.couponDiscount));
  const gift = Math.max(0, Math.trunc(args.giftRedeemAmount));
  const amountDueBeforeGift = Math.max(0, items + delivery - coupon);
  const giftRedemption = Math.min(gift, amountDueBeforeGift);
  return {
    amountDueBeforeGift,
    couponDiscount: coupon,
    giftRedemption,
    remainingPayment: amountDueBeforeGift - giftRedemption,
  };
}

/** Floor percent of integer — same spirit as order commission rounding. */
export function computeGiftPlatformFeeAndMerchantNet(args: {
  redeemedAmount: GiftMoneyInt;
  platformFeeRatePercent: GiftMoneyInt;
}): { platformFeeAmount: GiftMoneyInt; merchantNetAmount: GiftMoneyInt } {
  const redeemed = Math.max(0, Math.trunc(args.redeemedAmount));
  const rate = Math.max(0, Math.min(100, Math.trunc(args.platformFeeRatePercent)));
  const platformFeeAmount = Math.floor((redeemed * rate) / 100);
  const merchantNetAmount = redeemed - platformFeeAmount;
  return { platformFeeAmount, merchantNetAmount };
}

export function ownerRevenueAtSaleTime(): GiftMoneyInt {
  return 0;
}

// ─── Refund policy (pure — no writers in G1) ────────────────────────────────

export const GIFT_ORDER_PARTIAL_REFUND_SUPPORTED = false as const;
export const GIFT_FULL_ORDER_REFUND_REVERSES_ALL_REDEMPTIONS = true as const;
export const GIFT_CONVERTED_REVENUE_REQUIRES_CASH_OR_RECOVERY = true as const;

// ─── Coupon / paid-voucher regression anchors ────────────────────────────────

export function giftContractForbidsCouponPaidTypes(): boolean {
  return (
    PAID_VOUCHER_IMPLEMENTATION_BLOCKED === true &&
    isPaidCouponTypeForbidden("paid") &&
    isPaidCouponTypeForbidden("voucher") &&
    GIFT_IS_NOT_COUPON
  );
}

export function giftContractKeepsCheckoutDpointFalse(): boolean {
  return (
    STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported === false &&
    GIFT_DELIVERY_CHECKOUT_DPOINT_REMAINS
  );
}
