/**
 * Priority 3 — Owner Delivery Ads canonical entry / primary CTA hierarchy.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { buildBusinessAdminSidebar } from "@/lib/business/business-admin-nav";
import { ownerDeliveryAdsMessages } from "@/lib/i18n/catalog/owner-delivery-ads";

const hubSrc = () =>
  readFileSync(
    join(process.cwd(), "components/business/owner/ads/OwnerDeliveryAdsHubView.tsx"),
    "utf8"
  );

const myBizNavSrc = () =>
  readFileSync(join(process.cwd(), "lib/business/my-business-nav-i18n.ts"), "utf8");

const dashboardMenuSrc = () =>
  readFileSync(
    join(
      process.cwd(),
      "components/business/admin/dashboard/BusinessDashboardOwnerCardMenu.tsx"
    ),
    "utf8"
  );

const mypageAdsSrc = () =>
  readFileSync(join(process.cwd(), "app/(main)/mypage/ads/page.tsx"), "utf8");

describe("Priority 3 Owner Delivery Ads entry / CTA hierarchy", () => {
  it("T1 — active Owner Ads navigation points to /stores/owner/ads", () => {
    expect(OwnerRoutes.ads("s1")).toBe("/stores/owner/ads?storeId=s1");
    expect(OwnerRoutes.ads()).toBe("/stores/owner/ads");
    expect(DELIVERY_AD_OWNER_ROUTES.hub).toBe("/stores/owner/ads");

    const sections = buildBusinessAdminSidebar({
      storeId: "s1",
      slug: "demo",
      approvalStatus: "approved",
      isVisible: true,
      canSell: true,
      orderAlertsBadge: 0,
    });
    const ads = sections.flatMap((s) => s.items).find((i) => i.id === "ads");
    expect(ads?.href).toBe("/stores/owner/ads?storeId=s1");
    expect(ads?.href).not.toBe("/my/ads");

    expect(myBizNavSrc()).toContain("OwnerRoutes.ads(storeId)");
    expect(myBizNavSrc()).not.toMatch(/href:\s*"\/my\/ads"/);
  });

  it("T2 — hub exposes one primary 광고 신청하기 action", () => {
    const src = hubSrc();
    expect(src).toContain('data-owner-ads-primary-cta="apply"');
    expect(src).toContain('t("owner_ads_apply_primary_cta")');
    expect(ownerDeliveryAdsMessages.ko.owner_ads_apply_primary_cta).toBe("광고 신청");
    expect(ownerDeliveryAdsMessages.en.owner_ads_apply_primary_cta).toBe("Apply");
    expect(src.match(/data-owner-ads-primary-cta=/g)?.length).toBe(1);
  });

  it("T3 — primary CTA opens product selection rather than jumping to one product", () => {
    const src = hubSrc();
    expect(src).toContain("setProductSelectOpen(true)");
    expect(src).toContain("DibayBottomSheet");
    expect(src).toContain('data-owner-ads-product-select="1"');
    /** Competing first-level create Links removed from hub body. */
    expect(src).not.toMatch(
      /OwnerStoreAdminDashSection title=\{t\("owner_ads_product_entry_title"\)\}/
    );
  });

  it("T4/T5 — product selection uses existing canonical create routes", () => {
    const src = hubSrc();
    expect(src).toContain("DELIVERY_AD_OWNER_ROUTES.createStoreSponsored");
    expect(src).toContain("DELIVERY_AD_OWNER_ROUTES.createBanner");
    expect(DELIVERY_AD_OWNER_ROUTES.createStoreSponsored).toBe(
      "/stores/owner/ads/new/store-sponsored"
    );
    expect(DELIVERY_AD_OWNER_ROUTES.createBanner).toBe("/stores/owner/ads/new/banner");
    expect(src).not.toMatch(/href=\{["']\/stores\/owner\/ads\/new\//);
  });

  it("T6 — product descriptions distinguish store promotion vs banner", () => {
    const src = hubSrc();
    expect(src).toContain("owner_ads_product_store_sponsored_desc");
    expect(src).toContain("owner_ads_product_banner_desc");
    expect(src).toContain("owner_ads_product_store_sponsored_shape");
    expect(src).toContain("owner_ads_product_banner_shape");
    expect(ownerDeliveryAdsMessages.ko.owner_ads_product_store_sponsored).toBe("매장 홍보");
    expect(ownerDeliveryAdsMessages.ko.owner_ads_product_banner).toBe("배너");
  });

  it("T7 — /mypage/ads remains a separate non–Delivery Ads domain", () => {
    expect(mypageAdsSrc()).toContain("MyAdsPageClient");
    expect(mypageAdsSrc()).not.toContain("OwnerDeliveryAdsHubView");
    expect(mypageAdsSrc()).not.toContain("DELIVERY_AD_OWNER_ROUTES");
  });

  it("T8 — no new Delivery Ads hub/create route introduced", () => {
    expect(DELIVERY_AD_OWNER_ROUTES.hub).toBe("/stores/owner/ads");
    expect(Object.keys(DELIVERY_AD_OWNER_ROUTES)).toEqual([
      "hub",
      "createStoreSponsored",
      "createBanner",
      "detail",
    ]);
  });

  it("T9 — Business Cash remains informational / not implemented", () => {
    const src = hubSrc();
    expect(src).toContain("owner_ads_business_cash_preparing");
    expect(src).not.toMatch(/BusinessCashBalance|chargeBusinessCash|walletBalance/);
    expect(ownerDeliveryAdsMessages.ko.owner_ads_business_cash_preparing).toContain("준비 중");
  });

  it("Owner dashboard card menu exposes canonical Delivery Ads entry", () => {
    const src = dashboardMenuSrc();
    expect(src).toContain('id: "ads"');
    expect(src).toContain("`/stores/owner/ads?${q}`");
    expect(src).not.toMatch(/href: `\/my\/ads/);
  });

  it("legacy /stores/owner/banners remains store-banner domain (not Delivery Ads hub)", () => {
    expect(OwnerRoutes.banners("s1")).toBe("/stores/owner/banners?storeId=s1");
    expect(OwnerRoutes.banners("s1")).not.toBe(OwnerRoutes.ads("s1"));
    const sections = buildBusinessAdminSidebar({
      storeId: "s1",
      slug: "demo",
      approvalStatus: "approved",
      isVisible: true,
      canSell: true,
      orderAlertsBadge: 0,
    });
    const banners = sections.flatMap((s) => s.items).find((i) => i.id === "banners");
    expect(banners?.href).toContain("/stores/owner/banners");
  });
});
