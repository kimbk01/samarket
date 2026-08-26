/**
 * @deprecated Use store-coupon-handoff (v2). Thin bridge for existing imports.
 * Offer-id-only writes are rejected. Authority = storeId + userCouponId.
 */
import {
  clearStoreCouponHandoff,
  readStoreCouponHandoff,
  writeStoreCouponHandoff,
} from "@/lib/stores/store-coupon-handoff";

export type StoreCheckoutCouponSession = {
  storeId: string;
  campaignId: string;
  userCouponId?: string;
  couponNumber?: string;
};

export function writeStoreCheckoutCouponSession(input: StoreCheckoutCouponSession): void {
  const userCouponId = input.userCouponId?.trim() ?? "";
  if (!userCouponId) return;
  writeStoreCouponHandoff({
    storeId: input.storeId,
    userCouponId,
    couponNumber: input.couponNumber ?? "",
    offerId: input.campaignId,
  });
}

export function readStoreCheckoutCouponSession(storeId: string): StoreCheckoutCouponSession | null {
  const h = readStoreCouponHandoff(storeId);
  if (!h) return null;
  return {
    storeId: h.storeId,
    campaignId: h.offerId,
    userCouponId: h.userCouponId,
    couponNumber: h.couponNumber || undefined,
  };
}

export function clearStoreCheckoutCouponSession(): void {
  clearStoreCouponHandoff();
}
