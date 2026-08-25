import type { StoreCouponFundingMode } from "@/lib/stores/store-coupon-ssot";

/** Coupon % / min_order base = checkout paymentTotal (items after line discount). */
export function computeCouponDiscountPhp(input: {
  discountType: "percent" | "fixed_amount";
  discountValue: number;
  itemSubtotalPhp: number;
  maxDiscountPhp: number | null;
}): number {
  const gross = Math.max(0, Math.floor(input.itemSubtotalPhp));
  if (gross <= 0) return 0;
  if (input.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, input.discountValue));
    let amount = Math.min(gross, Math.floor((gross * pct) / 100));
    if (input.maxDiscountPhp != null && Number.isFinite(input.maxDiscountPhp) && input.maxDiscountPhp > 0) {
      amount = Math.min(amount, Math.floor(input.maxDiscountPhp));
    }
    return amount;
  }
  return Math.min(gross, Math.floor(input.discountValue));
}

export function splitCouponFunding(input: {
  discountPhp: number;
  fundingMode: StoreCouponFundingMode;
  storeFundedPhp?: number | null;
}): { storeFundedAmount: number; platformFundedAmount: number } {
  const d = Math.max(0, Math.floor(input.discountPhp));
  if (input.fundingMode === "STORE_FUNDED") {
    return { storeFundedAmount: d, platformFundedAmount: 0 };
  }
  if (input.fundingMode === "PLATFORM_FUNDED") {
    return { storeFundedAmount: 0, platformFundedAmount: d };
  }
  const store = Math.max(0, Math.floor(input.storeFundedPhp ?? 0));
  const storeClamped = Math.min(d, store);
  return { storeFundedAmount: storeClamped, platformFundedAmount: d - storeClamped };
}

export function computeNewOrderCommissionBasePhp(input: {
  itemSubtotalPhp: number;
  deliveryFeePhp: number;
}): number {
  return Math.max(0, Math.floor(input.itemSubtotalPhp) + Math.floor(input.deliveryFeePhp));
}

export function computeStoreSettlementFromCouponFunding(input: {
  netBeforeRefund: number;
  storeFundedAmount: number;
}): number {
  return Math.max(0, Math.floor(input.netBeforeRefund) - Math.floor(input.storeFundedAmount));
}
