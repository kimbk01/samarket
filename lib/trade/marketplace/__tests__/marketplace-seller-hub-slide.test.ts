import { describe, expect, it } from "vitest";
import {
  isMarketplaceSellerHubPath,
  marketplaceSellerHubDepth,
} from "@/lib/trade/marketplace/marketplace-seller-hub-slide";

describe("marketplaceSellerHubDepth", () => {
  it("orders sell hub stack paths", () => {
    expect(marketplaceSellerHubDepth("/market/sell")).toBe(0);
    expect(marketplaceSellerHubDepth("/mypage/products")).toBe(1);
    expect(marketplaceSellerHubDepth("/mypage/products?filter=active")).toBe(1);
    expect(marketplaceSellerHubDepth("/mypage/points/promotions")).toBe(2);
    expect(marketplaceSellerHubDepth("/market")).toBe(-1);
  });

  it("detects seller hub paths", () => {
    expect(isMarketplaceSellerHubPath("/market/sell")).toBe(true);
    expect(isMarketplaceSellerHubPath("/mypage/products")).toBe(true);
    expect(isMarketplaceSellerHubPath("/mypage/points/promotions")).toBe(true);
    expect(isMarketplaceSellerHubPath("/mypage/trade/sales")).toBe(false);
  });
});
