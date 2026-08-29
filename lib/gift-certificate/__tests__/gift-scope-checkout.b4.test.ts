import { describe, expect, it } from "vitest";
import {
  assertGiftScopeStoreId,
  giftInstanceAllowsCheckoutStore,
  resolveGiftCreationSource,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  filterCheckoutEligibleGifts,
  isCheckoutEligibleGiftInstance,
} from "@/lib/gift-certificate/checkout-eligible-gifts";
import type { GiftWalletInstance } from "@/lib/gift-certificate/load-gift-wallet";

function inst(
  partial: Partial<GiftWalletInstance> & Pick<GiftWalletInstance, "id">
): GiftWalletInstance {
  return {
    productId: "p1",
    giftScope: "STORE",
    storeId: "store-a",
    storeName: "Store A",
    title: "Gift",
    imageUrl: null,
    transferable: true,
    faceValue: 1000,
    purchasePrice: 1000,
    remainingBalance: 1000,
    status: "ACTIVE",
    purchasedAt: "2026-01-01",
    fullyRedeemedAt: null,
    validFrom: null,
    validUntil: null,
    ...partial,
  };
}

describe("gift scope STORE vs PLATFORM checkout (B4 T1–T8)", () => {
  const storeA = "store-a";
  const storeB = "store-b";

  it("T1 STORE gift same store allowed", () => {
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g1", giftScope: "STORE", storeId: storeA }),
        storeA
      )
    ).toBe(true);
  });

  it("T2 STORE gift other store blocked", () => {
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g2", giftScope: "STORE", storeId: storeA }),
        storeB
      )
    ).toBe(false);
  });

  it("T3 PLATFORM gift eligible Store A allowed", () => {
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g3", giftScope: "PLATFORM", storeId: null, storeName: "DIBAY" }),
        storeA,
        { checkoutStoreEligible: true }
      )
    ).toBe(true);
  });

  it("T4 PLATFORM gift eligible Store B allowed", () => {
    const gifts = filterCheckoutEligibleGifts(
      [inst({ id: "g4", giftScope: "PLATFORM", storeId: null })],
      storeB,
      { checkoutStoreEligible: true }
    );
    expect(gifts).toHaveLength(1);
    expect(gifts[0]?.giftScope).toBe("PLATFORM");
  });

  it("T5 PLATFORM gift ineligible/suspended store blocked", () => {
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g5", giftScope: "PLATFORM", storeId: null }),
        storeA,
        { checkoutStoreEligible: false }
      )
    ).toBe(false);
  });

  it("T6 pending-transfer gift blocked", () => {
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g6", giftScope: "STORE", storeId: storeA, status: "GIFT_LOCKED" }),
        storeA
      )
    ).toBe(false);
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g6p", giftScope: "PLATFORM", storeId: null, status: "GIFT_LOCKED" }),
        storeA,
        { checkoutStoreEligible: true }
      )
    ).toBe(false);
  });

  it("T7 wrong owner blocked is status/ownership layer (redeemable status required)", () => {
    // Projection filter only sees wallet.available (owner-scoped). SUSPENDED is blocked here.
    expect(
      isCheckoutEligibleGiftInstance(
        inst({ id: "g7", giftScope: "STORE", storeId: storeA, status: "SUSPENDED" }),
        storeA
      )
    ).toBe(false);
  });

  it("T8 remaining balance preserved in projection", () => {
    const gifts = filterCheckoutEligibleGifts(
      [
        inst({
          id: "g8",
          giftScope: "PLATFORM",
          storeId: null,
          remainingBalance: 350,
          status: "PARTIALLY_REDEEMED",
        }),
      ],
      storeA,
      { checkoutStoreEligible: true }
    );
    expect(gifts[0]?.remainingBalance).toBe(350);
  });

  it("scope store_id contract", () => {
    expect(assertGiftScopeStoreId("STORE", "abc").ok).toBe(true);
    expect(assertGiftScopeStoreId("STORE", null).ok).toBe(false);
    expect(assertGiftScopeStoreId("PLATFORM", null).ok).toBe(true);
    expect(assertGiftScopeStoreId("PLATFORM", "abc").ok).toBe(false);
  });

  it("creation source resolution", () => {
    expect(resolveGiftCreationSource({ giftScope: "PLATFORM" })).toBe("ADMIN_DIRECT_PLATFORM");
    expect(resolveGiftCreationSource({ giftScope: "STORE", applicationId: "a1" })).toBe(
      "OWNER_APPLICATION"
    );
    expect(resolveGiftCreationSource({ giftScope: "STORE" })).toBe("ADMIN_DIRECT_STORE");
  });

  it("never infer PLATFORM from null store_id alone without giftScope", () => {
    expect(
      giftInstanceAllowsCheckoutStore({
        giftScope: undefined,
        instanceStoreId: null,
        checkoutStoreId: storeA,
      })
    ).toBe(false);
  });
});
