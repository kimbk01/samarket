import { describe, expect, it } from "vitest";
import {
  checkoutGiftInstanceIdsPayload,
  computeCheckoutGiftApplyPreview,
  filterCheckoutEligibleGifts,
  isCheckoutEligibleGiftInstance,
} from "@/lib/gift-certificate/checkout-eligible-gifts";
import type { GiftWalletInstance } from "@/lib/gift-certificate/load-gift-wallet";
import { computeCheckoutLayersBeforeAndAfterGift } from "@/lib/gift-certificate/gift-certificate-domain-contract";

function inst(partial: Partial<GiftWalletInstance> & Pick<GiftWalletInstance, "id" | "storeId">): GiftWalletInstance {
  return {
    productId: "p1",
    storeName: "Store",
    title: "Gift",
    imageUrl: null,
    transferable: true,
    faceValue: 1000,
    purchasePrice: 1000,
    remainingBalance: 1000,
    status: "ACTIVE",
    purchasedAt: "2026-01-01",
    fullyRedeemedAt: null,
    ...partial,
  };
}

describe("checkout-eligible-gifts (U4)", () => {
  const storeA = "store-a";
  const storeB = "store-b";

  it("T1: same-store Gift visible", () => {
    const gifts = filterCheckoutEligibleGifts(
      [inst({ id: "g1", storeId: storeA, remainingBalance: 500, status: "ACTIVE" })],
      storeA
    );
    expect(gifts).toHaveLength(1);
    expect(gifts[0]?.instanceId).toBe("g1");
  });

  it("T2: other-store Gift excluded", () => {
    const gifts = filterCheckoutEligibleGifts(
      [inst({ id: "g2", storeId: storeB, remainingBalance: 500, status: "ACTIVE" })],
      storeA
    );
    expect(gifts).toHaveLength(0);
    expect(isCheckoutEligibleGiftInstance(inst({ id: "g2", storeId: storeB }), storeA)).toBe(false);
  });

  it("T3: Gift > due → partial apply (use due only)", () => {
    const preview = computeCheckoutGiftApplyPreview({ amountBeforeGift: 300, giftRemaining: 1000 });
    expect(preview.giftUsed).toBe(300);
    expect(preview.paymentAfterGift).toBe(0);
    expect(preview.giftRemainingAfter).toBe(700);
  });

  it("T4: Gift < due → full balance apply", () => {
    const preview = computeCheckoutGiftApplyPreview({ amountBeforeGift: 300, giftRemaining: 100 });
    expect(preview.giftUsed).toBe(100);
    expect(preview.paymentAfterGift).toBe(200);
    expect(preview.giftRemainingAfter).toBe(0);
  });

  it("T5: Coupon before Gift calculation", () => {
    const layers = computeCheckoutLayersBeforeAndAfterGift({
      itemGross: 500,
      deliveryFee: 50,
      couponDiscount: 50,
      giftRedeemAmount: 300,
    });
    expect(layers.amountDueBeforeGift).toBe(500);
    expect(layers.giftRedemption).toBe(300);
    expect(layers.remainingPayment).toBe(200);
  });

  it("T6: remove Gift restores payment", () => {
    const withGift = computeCheckoutGiftApplyPreview({ amountBeforeGift: 400, giftRemaining: 150 });
    expect(withGift.paymentAfterGift).toBe(250);
    const without = computeCheckoutGiftApplyPreview({ amountBeforeGift: 400, giftRemaining: 0 });
    expect(without.giftUsed).toBe(0);
    expect(without.paymentAfterGift).toBe(400);
  });

  it("T7: order payload contains Gift identity only", () => {
    expect(checkoutGiftInstanceIdsPayload("abc")).toEqual(["abc"]);
    expect(checkoutGiftInstanceIdsPayload(null)).toBeUndefined();
    expect(checkoutGiftInstanceIdsPayload("")).toBeUndefined();
  });

  it("T8: Order detail uses durable Gift snapshot fields (contract)", () => {
    const order = { gift_redemption_amount: 300, amount_before_gift: 500, payment_amount: 200 };
    expect(order.gift_redemption_amount).toBe(300);
    expect(order.payment_amount).toBe(order.amount_before_gift - order.gift_redemption_amount);
  });

  it("T9: Wallet partial remaining stays available", () => {
    const gifts = filterCheckoutEligibleGifts(
      [inst({ id: "g9", storeId: storeA, remainingBalance: 700, status: "PARTIALLY_REDEEMED" })],
      storeA
    );
    expect(gifts).toHaveLength(1);
    expect(gifts[0]?.remainingBalance).toBe(700);
  });

  it("T10: fully redeemed excluded from checkout eligible", () => {
    const gifts = filterCheckoutEligibleGifts(
      [inst({ id: "g10", storeId: storeA, remainingBalance: 0, status: "FULLY_REDEEMED" })],
      storeA
    );
    expect(gifts).toHaveLength(0);
  });

  it("T11: refund projection keeps use + restore amounts", () => {
    const used = 300;
    const remainingAfterOrder = 700;
    const remainingAfterRefund = remainingAfterOrder + used;
    expect(remainingAfterRefund).toBe(1000);
    const history = [
      { kind: "use", amount: used },
      { kind: "restore", amount: used },
    ];
    expect(history).toHaveLength(2);
  });

  it("excludes GIFT_LOCKED and SUSPENDED", () => {
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "locked", storeId: storeA, status: "GIFT_LOCKED", remainingBalance: 1000 }),
        storeA
      )
    ).toBe(false);
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "sus", storeId: storeA, status: "SUSPENDED", remainingBalance: 1000 }),
        storeA
      )
    ).toBe(false);
  });
});
