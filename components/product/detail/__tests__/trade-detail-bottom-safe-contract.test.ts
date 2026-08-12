import { describe, expect, it } from "vitest";
import {
  tradePostDetailSellerBandVisible,
  TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW,
  TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER,
  TRADE_POST_DETAIL_BOTTOM_SELLER_BAND,
} from "@/components/product/detail/product-detail-bottom-constants";

describe("trade post detail bottom safe-area contract", () => {
  it("sellerBandVisible requires at least one CTA", () => {
    expect(tradePostDetailSellerBandVisible({ showSellerOfferList: false, canApplyTradeAd: false })).toBe(
      false
    );
    expect(tradePostDetailSellerBandVisible({ showSellerOfferList: true, canApplyTradeAd: false })).toBe(true);
    expect(tradePostDetailSellerBandVisible({ showSellerOfferList: false, canApplyTradeAd: true })).toBe(true);
  });

  it("buyer primary consumes safe-bottom; above-seller primary does not", () => {
    expect(TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW).toContain("pb-[max(10px,var(--safe-bottom))]");
    expect(TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER).toContain("pb-0");
    expect(TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER).not.toContain("--safe-bottom");
  });

  it("seller band is the only bottom-most safe consumer among primary variants", () => {
    expect(TRADE_POST_DETAIL_BOTTOM_SELLER_BAND).toContain("pb-[max(10px,var(--safe-bottom))]");
    expect(TRADE_POST_DETAIL_BOTTOM_SELLER_BAND).toContain("pt-2");
    expect(TRADE_POST_DETAIL_BOTTOM_SELLER_BAND).not.toContain("pt-3");
  });
});
