import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";
import {
  formatAdsBusinessCashPackagePrice,
  formatAdsPointPrice,
} from "@/lib/admin/ads-commercial/products-control-model";
import { OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED } from "@/lib/platform-popup/owner-popup-new-sales-gate";
import { listActiveMemberPromotionProducts } from "@/lib/points/promotion-products";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("CUT R6 products / pricing commercial control", () => {
  it("exposes exactly 7 canonical product families", () => {
    expect(Object.keys(ADS_CANONICAL_PRODUCTS)).toHaveLength(7);
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("community_boost");
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("trade_boost");
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("delivery_store_sponsored");
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("community_banner");
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("trade_banner");
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("delivery_home_banner");
    expect(ADS_CANONICAL_PRODUCTS).toHaveProperty("popup");
  });

  it("payment / approval / Admin Direct policy locks", () => {
    expect(ADS_CANONICAL_PRODUCTS.community_boost.currency).toBe("POINT");
    expect(ADS_CANONICAL_PRODUCTS.community_boost.approvalRequired).toBe(false);
    expect(ADS_CANONICAL_PRODUCTS.trade_boost.approvalRequired).toBe(false);
    expect(ADS_CANONICAL_PRODUCTS.delivery_store_sponsored.currency).toBe("BUSINESS_CASH");
    expect(ADS_CANONICAL_PRODUCTS.delivery_store_sponsored.approvalRequired).toBe(true);
    expect(ADS_CANONICAL_PRODUCTS.popup.actor).toBe("admin_direct");
    expect(ADS_CANONICAL_PRODUCTS.popup.currency).toBe("N_A");
    expect(ADS_CANONICAL_PRODUCTS.popup.sellable).toBe(false);
    expect(OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED).toBe(false);
  });

  it("Boost Point packages come from code SSOT with day units", () => {
    const community = listActiveMemberPromotionProducts("community");
    const trade = listActiveMemberPromotionProducts("trade");
    expect(community.length).toBeGreaterThan(0);
    expect(trade.length).toBeGreaterThan(0);
    expect(formatAdsPointPrice(10000, 3, true)).toContain("Point");
    expect(formatAdsPointPrice(10000, 3, true)).toContain("3일");
    expect(formatAdsPointPrice(500, 7, false)).toContain("7 days");
  });

  it("Business Cash package formatter does not invent /일 without duration package", () => {
    expect(formatAdsBusinessCashPackagePrice(12000, 7, true)).toContain("Business Cash");
    expect(formatAdsBusinessCashPackagePrice(12000, 7, true)).toContain("7일");
    expect(formatAdsBusinessCashPackagePrice(null, 7, true)).toMatch(/미설정|not configured/i);
  });

  it("UI: 7 cards, no fake writers, R5/R2 routes, legacy duplicates hidden", () => {
    const view = read("components/admin/ads/AdminAdsProductsCommercialView.tsx");
    const model = read("lib/admin/ads-commercial/products-control-model.ts");
    expect(view).toContain('data-admin-ads-r6="1"');
    expect(view).toContain("ADS_PRODUCTS_PLACEMENTS_HREF");
    expect(view).toContain("data-ads-price-readonly");
    expect(view).not.toContain("더 알리기");
    expect(view).not.toContain("trade_post_ads");
    expect(view).not.toContain("Owner Popup");
    expect(model).toContain("/admin/advertising/placements");
    expect(model).toContain('productKey: "community_boost"');
    expect(model).toContain('productKey: "popup"');
    expect(model).toContain("/admin/advertising/direct/community");
    expect(model).toContain("/admin/advertising/direct/trade");
    expect(model).toContain("/admin/advertising/direct/delivery");
    expect(model).toContain("/admin/advertising/direct/popup");
    expect(model).toContain("editPriceHref: null"); // boost/popup readonly
    expect(model).toContain("/admin/delivery-ads/commercial-settings");
    expect(model).toContain("/admin/feed-ad-products");
    expect(model).toContain("OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED");
    expect(model).toContain("STORES_SEARCH_TOP");
    expect(model).toContain("STORES_HOME_INLINE_1");
    // No invented mutation endpoints in R6 surface
    expect(view).not.toContain("/api/admin/advertising/products-price");
    expect(view).not.toContain("가격을 변경하시겠습니까");
  });

  it("Delivery commercial admin writer exists; Boost price writer does not", () => {
    const deliveryWriter = read(
      "lib/stores/advertising/delivery-ad-commercial-admin-writer.ts"
    );
    const feedWriter = read("lib/ads/feed-ad-products.ts");
    const boost = read("lib/points/promotion-products.ts");
    expect(deliveryWriter).toContain("adminUpdateDeliveryAdPackagePrice");
    expect(deliveryWriter).toContain("adminSetPlacementSellable");
    expect(feedWriter).toContain("export async function updateFeedAdProduct");
    expect(boost).not.toContain("updateMemberPromotionProduct");
    expect(boost).toContain("const PRODUCTS");
  });
});
