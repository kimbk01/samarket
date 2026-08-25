import { describe, expect, it } from "vitest";
import {
  computeCouponDiscountPhp,
  computeNewOrderCommissionBasePhp,
  computeStoreSettlementFromCouponFunding,
  splitCouponFunding,
} from "@/lib/stores/store-coupon-funding-math";

describe("FREE COUPON funding math", () => {
  it("caps percent by max_discount", () => {
    expect(
      computeCouponDiscountPhp({
        discountType: "percent",
        discountValue: 50,
        itemSubtotalPhp: 900,
        maxDiscountPhp: 100,
      })
    ).toBe(100);
  });
  it("uses item subtotal not delivery for percent coupon", () => {
    expect(
      computeCouponDiscountPhp({
        discountType: "percent",
        discountValue: 10,
        itemSubtotalPhp: 900,
        maxDiscountPhp: null,
      })
    ).toBe(90);
    expect(computeNewOrderCommissionBasePhp({ itemSubtotalPhp: 900, deliveryFeePhp: 60 })).toBe(960);
  });

  it("STORE / PLATFORM / SHARED ₱100 examples without double subsidy", () => {
    const discount = 100;
    const feeOn960 = Math.floor((960 * 10) / 100);
    expect(feeOn960).toBe(96);
    const store = splitCouponFunding({ discountPhp: discount, fundingMode: "STORE_FUNDED" });
    expect(store).toEqual({ storeFundedAmount: 100, platformFundedAmount: 0 });
    expect(computeStoreSettlementFromCouponFunding({ netBeforeRefund: 960 - 96, storeFundedAmount: 100 })).toBe(
      764
    );
    const plat = splitCouponFunding({ discountPhp: discount, fundingMode: "PLATFORM_FUNDED" });
    expect(plat).toEqual({ storeFundedAmount: 0, platformFundedAmount: 100 });
    expect(computeStoreSettlementFromCouponFunding({ netBeforeRefund: 864, storeFundedAmount: 0 })).toBe(864);
    const shared = splitCouponFunding({
      discountPhp: discount,
      fundingMode: "SHARED_FUNDED",
      storeFundedPhp: 60,
    });
    expect(shared).toEqual({ storeFundedAmount: 60, platformFundedAmount: 40 });
    expect(computeStoreSettlementFromCouponFunding({ netBeforeRefund: 864, storeFundedAmount: 60 })).toBe(804);
  });
});
