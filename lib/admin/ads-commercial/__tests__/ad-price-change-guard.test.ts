import { describe, expect, it } from "vitest";
import {
  AD_PHP_PRICE_CAP_MINOR,
  AD_POINT_PRICE_CAP,
  formatAdPriceRatio,
  isAdPhpPriceOverCap,
  isAdPointPriceOverCap,
  isBigAdPriceChange,
} from "@/lib/admin/ads-commercial/ad-price-change-guard";

describe("D-13 광고 가격 오타 방지", () => {
  it("상한: 1,000,000P · ₱100,000", () => {
    expect(isAdPointPriceOverCap(AD_POINT_PRICE_CAP)).toBe(false);
    expect(isAdPointPriceOverCap(AD_POINT_PRICE_CAP + 1)).toBe(true);
    expect(isAdPhpPriceOverCap(AD_PHP_PRICE_CAP_MINOR)).toBe(false);
    expect(isAdPhpPriceOverCap(AD_PHP_PRICE_CAP_MINOR + 1)).toBe(true);
  });
  it("3배 이상 오르거나 1/3 이하로 내리면 다시 확인", () => {
    expect(isBigAdPriceChange(500, 1500)).toBe(true);
    expect(isBigAdPriceChange(500, 1499)).toBe(false);
    expect(isBigAdPriceChange(1500, 500)).toBe(true);
    expect(isBigAdPriceChange(null, 500)).toBe(false);
    expect(formatAdPriceRatio(500, 1250)).toBe("×2.5");
  });
});
