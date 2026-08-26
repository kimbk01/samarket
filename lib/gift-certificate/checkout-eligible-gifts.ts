/**
 * Checkout-eligible Gift Certificate projection (U4).
 * Server authority for same-store redeemable instances — UI filter is not enough.
 */

import type { GiftWalletInstance } from "@/lib/gift-certificate/load-gift-wallet";
import {
  GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL,
  computeGiftRedemptionSplit,
  giftInstanceAllowsRedeem,
  isGiftInstanceStatus,
  type GiftInstanceStatus,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";

export type CheckoutEligibleGift = {
  instanceId: string;
  storeId: string;
  storeName: string;
  title: string;
  imageUrl: string | null;
  faceValue: number;
  remainingBalance: number;
  status: GiftInstanceStatus;
};

export function isCheckoutEligibleGiftInstance(
  inst: Pick<GiftWalletInstance, "storeId" | "remainingBalance" | "status">,
  orderStoreId: string
): boolean {
  const storeId = orderStoreId.trim();
  if (!storeId || inst.storeId.trim() !== storeId) return false;
  if (Math.trunc(Number(inst.remainingBalance) || 0) <= 0) return false;
  if (!isGiftInstanceStatus(inst.status)) return false;
  return giftInstanceAllowsRedeem(inst.status);
}

export function filterCheckoutEligibleGifts(
  instances: GiftWalletInstance[],
  orderStoreId: string
): CheckoutEligibleGift[] {
  const out: CheckoutEligibleGift[] = [];
  for (const inst of instances) {
    if (!isCheckoutEligibleGiftInstance(inst, orderStoreId)) continue;
    out.push({
      instanceId: inst.id,
      storeId: inst.storeId,
      storeName: inst.storeName,
      title: inst.title,
      imageUrl: inst.imageUrl,
      faceValue: inst.faceValue,
      remainingBalance: Math.trunc(Number(inst.remainingBalance) || 0),
      status: inst.status as GiftInstanceStatus,
    });
  }
  return out;
}

export function computeCheckoutGiftApplyPreview(args: {
  amountBeforeGift: number;
  giftRemaining: number;
}): {
  giftUsed: number;
  paymentAfterGift: number;
  giftRemainingAfter: number;
} {
  const split = computeGiftRedemptionSplit({
    amountDueBeforeGift: Math.max(0, Math.trunc(args.amountBeforeGift)),
    giftRemaining: Math.max(0, Math.trunc(args.giftRemaining)),
  });
  return {
    giftUsed: split.redeemAmount,
    paymentAfterGift: split.remainingPayment,
    giftRemainingAfter: split.giftRemainingAfter,
  };
}

export function checkoutGiftInstanceIdsPayload(
  selectedInstanceId: string | null | undefined
): string[] | undefined {
  const id = String(selectedInstanceId ?? "").trim();
  if (!id) return undefined;
  return [id].slice(0, GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL);
}
