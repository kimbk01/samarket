/**
 * PAID GIFT CERTIFICATE — G1 Domain Contract (DESIGN_LOCKED from G0).
 *
 * CODE CHANGE SCOPE (G1): types · constants · pure validators · pure calculators.
 * FORBIDDEN in G1: migrations · tables · RPC · API · UI · Messenger · Checkout prod · Store Cash DB.
 *
 * HARD BOUNDARIES:
 * - Free Coupon = discount entitlement (store-coupon-ssot) — never merge.
 * - Paid Gift = store-scoped stored-value payment asset.
 * - Member D-Point = Gift Mall purchase rail only (not delivery checkout).
 * - Business Credit (stores.point_balance) ≠ Gift Revenue ≠ Store Cash.
 * - store_settlements = order accounting ≠ Gift Revenue.
 * - Store Cash = future separate ledger (logical contract only here).
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

/** Paid Gift value never expires (RA 10962-aligned product contract). */
export const GIFT_INSTANCE_EXPIRY_DISABLED = true as const;
export const GIFT_BALANCE_EXPIRY_DISABLED = true as const;

/** Sales campaign window is allowed; it does not expire issued value. */
export const GIFT_SALES_WINDOW_ALLOWED = true as const;

/** Owner cannot self-issue sellable products — Admin approve/create only. */
export const GIFT_ADMIN_ISSUED_ONLY = true as const;

/** Default product.transferable when Admin does not override. */
export const GIFT_TRANSFERABLE_DEFAULT = true as const;

/** Gift is always store-scoped for redemption. */
export const GIFT_STORE_SCOPED = true as const;

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

/** Delivery checkout must not gain D-Point because of Gift. */
export const GIFT_DELIVERY_CHECKOUT_DPOINT_REMAINS =
  STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported === false;

// ─── Revenue recognition ────────────────────────────────────────────────────

export const GIFT_OWNER_REVENUE_RECOGNITION = "redemption_only" as const;
export const GIFT_PLATFORM_FEE_RECOGNITION = "redemption_only" as const;
export const GIFT_SALE_TIME_OWNER_REVENUE_FORBIDDEN = true as const;

/** Foreign authorities Gift must never treat as Gift Revenue / Store Cash. */
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

// ─── Store Cash (logical only — no DB in G1) ────────────────────────────────

export const STORE_CASH_LEDGER_SOURCE_TYPES = [
  "GIFT_REVENUE_CONVERSION",
  "GIFT_REDEMPTION_REVERSAL",
  "RECOVERY_CLEAR",
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
