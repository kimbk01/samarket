/**
 * Checkout-eligible Gift Certificate projection (U4 + B4 scope).
 * Server authority for STORE same-store / PLATFORM eligible-store — UI filter is not enough.
 */

import type { GiftWalletInstance } from "@/lib/gift-certificate/load-gift-wallet";
import {
  GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL,
  computeGiftRedemptionSplit,
  giftInstanceAllowsCheckoutStore,
  giftInstanceAllowsRedeem,
  giftInstanceValidityError,
  isGiftInstanceStatus,
  isGiftScope,
  type GiftInstanceStatus,
  type GiftScope,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";

export type CheckoutEligibleGift = {
  instanceId: string;
  publicGiftNumber: string;
  giftScope: GiftScope;
  storeId: string | null;
  storeName: string;
  title: string;
  imageUrl: string | null;
  faceValue: number;
  remainingBalance: number;
  status: GiftInstanceStatus;
};

export function isCheckoutEligibleGiftInstance(
  inst: Pick<GiftWalletInstance, "storeId" | "remainingBalance" | "status" | "giftScope"> &
    Partial<Pick<GiftWalletInstance, "validFrom" | "validUntil">>,
  orderStoreId: string,
  opts?: { checkoutStoreEligible?: boolean; now?: Date }
): boolean {
  const storeId = orderStoreId.trim();
  if (!storeId) return false;
  const scope: GiftScope = isGiftScope(inst.giftScope) ? inst.giftScope : "STORE";
  if (
    !giftInstanceAllowsCheckoutStore({
      giftScope: scope,
      instanceStoreId: inst.storeId,
      checkoutStoreId: storeId,
    })
  ) {
    return false;
  }
  if (scope === "PLATFORM" && opts?.checkoutStoreEligible === false) {
    return false;
  }
  if (Math.trunc(Number(inst.remainingBalance) || 0) <= 0) return false;
  if (!isGiftInstanceStatus(inst.status)) return false;
  if (!giftInstanceAllowsRedeem(inst.status)) return false;
  // 유효기간(Asia/Manila date) — 만료·사용 시작 전 상품권은 결제 선택지에서 제외 (SQL 과 동일 의미)
  return (
    giftInstanceValidityError(
      { validFrom: inst.validFrom ?? null, validUntil: inst.validUntil ?? null },
      opts?.now
    ) === null
  );
}

export function filterCheckoutEligibleGifts(
  instances: GiftWalletInstance[],
  orderStoreId: string,
  opts?: { checkoutStoreEligible?: boolean; now?: Date }
): CheckoutEligibleGift[] {
  const out: CheckoutEligibleGift[] = [];
  for (const inst of instances) {
    if (!isCheckoutEligibleGiftInstance(inst, orderStoreId, opts)) continue;
    const scope: GiftScope = isGiftScope(inst.giftScope) ? inst.giftScope : "STORE";
    out.push({
      instanceId: inst.id,
      publicGiftNumber: inst.publicGiftNumber ?? "",
      giftScope: scope,
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
  const id = typeof selectedInstanceId === "string" ? selectedInstanceId.trim() : "";
  if (!id) return undefined;
  return [id].slice(0, GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL);
}
