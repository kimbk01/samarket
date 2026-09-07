/**
 * Ads / Exposure FULL SSOT — targeted contract proofs (no new engine).
 */
import { describe, expect, it } from "vitest";
import {
  ADS_CANONICAL_PRODUCTS,
  adsCanonicalPublicName,
} from "@/lib/ads/ads-canonical-product-ssot";
import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";
import { FEED_AD_SLIDE_INTERVAL_MS } from "@/lib/ads/feed-ad-geometry";
import { DELIVERY_AD_OWNER_PRICING_PRODUCT } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { LAUNCH_BANNER_PLACEMENTS } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { listActiveMemberPromotionProducts } from "@/lib/points/promotion-products";
import {
  adminMenu,
  filterMenuByRole,
  filterMenuForPublicSidebar,
} from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

describe("Ads FULL SSOT normalization", () => {
  it("PHASE1 — Delivery Sponsored commercial package authority is CONFIGURED", () => {
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.status).toBe("CONFIGURED");
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.packageAuthority).toBe("delivery_ad_packages");
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.currency).toBe("BUSINESS_CASH");
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.businessCashOnSubmit).toBe(true);
    expect(DELIVERY_AD_OWNER_PRICING_PRODUCT.chargeCollection).toBe(false);
    expect(ADS_CANONICAL_PRODUCTS.delivery_store_sponsored.commercialFamily).toBe(
      "delivery_ad_packages"
    );
  });

  it("PHASE2 — Community/Trade boost SKUs require no admin approval", () => {
    for (const p of listActiveMemberPromotionProducts()) {
      expect(p.requiresAdminApproval).toBe(false);
      expect(p.priceAsset).toBe("D_POINT");
    }
    expect(ADS_CANONICAL_PRODUCTS.community_boost.approvalRequired).toBe(false);
    expect(ADS_CANONICAL_PRODUCTS.trade_boost.approvalRequired).toBe(false);
  });

  it("PHASE3 — Feed/Delivery carousel intervals reference capacity SSOT (values locked)", () => {
    expect(FEED_AD_SLIDE_INTERVAL_MS).toBe(4000);
    expect(FEED_AD_SLIDE_INTERVAL_MS).toBe(
      BANNER_PLACEMENT_CAPACITY_SSOT.COMMUNITY_HOME.rotationIntervalMs
    );
    expect(LAUNCH_BANNER_PLACEMENTS[0]?.autoSlideMs).toBe(5000);
    expect(LAUNCH_BANNER_PLACEMENTS[0]?.autoSlideMs).toBe(
      BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.rotationIntervalMs
    );
  });

  it("PHASE5 — ads-legacy kept in menu tree but retired from PUBLIC sidebar", () => {
    const legacy = findAdminMenuByKey(adminMenu, "ads-legacy");
    expect(legacy).toBeTruthy();
    expect(legacy?.sidebarPublic).toBe(false);
    // Routing tree still includes ads-legacy (deep-link matchPaths).
    const routingAds = filterMenuByRole(adminMenu, "master").find((i) => i.key === "ads");
    expect(routingAds?.children?.some((c) => c.key === "ads-legacy")).toBe(true);
    // PUBLIC sidebar retires ads-legacy.
    const publicAds = filterMenuForPublicSidebar(routingAds?.children ?? []);
    expect(publicAds.some((c) => c.key === "ads-legacy")).toBe(false);
    const keys = publicAds.map((c) => c.key);
    expect(keys).toEqual([
      "ads-advertising-workspace",
      "ads-authority-boosts",
      "ads-authority-applications",
      "ads-authority-operations",
      "ads-authority-placements",
      "ads-authority-products",
      "ads-authority-history",
    ]);
  });

  it("PHASE6 — PUBLIC canonical product names", () => {
    expect(adsCanonicalPublicName("trade_boost", true)).toBe("거래 상위노출");
    expect(adsCanonicalPublicName("community_boost", true)).toBe("Community 상위노출");
    expect(adsCanonicalPublicName("delivery_store_sponsored", true)).toBe("배달 매장 홍보");
    expect(adsCanonicalPublicName("popup", true)).toBe("팝업");
  });
});
