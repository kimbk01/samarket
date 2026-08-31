/**
 * Open-event commercial seed + grandfather/snapshot copy contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  DELIVERY_AD_OPEN_EVENT_COMMERCIAL,
  DELIVERY_AD_OPEN_EVENT_PACKAGE_PRICES_PHP_MAJOR,
  DELIVERY_AD_OPEN_EVENT_PARTNER,
  countUnsetSellablePackageSlots,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Delivery ads open-event commercial CUT", () => {
  it("migration seeds 12 package prices + partner 120/15%", () => {
    const sql = read(
      "supabase/migrations/20261201260000_delivery_ads_open_event_sample_prices.sql"
    );
    expect(sql).toContain("price_amount_minor = 12000");
    expect(sql).toContain("price_amount_minor = 110000");
    expect(sql).toContain("price_amount_minor = 79000");
    expect(sql).toContain("monthly_fee_minor = 12000");
    expect(sql).toContain("advertising_discount_percent = 15");
    expect(sql).toContain("STORES_HOME_FEED");
    expect(sql).toContain("STORES_HOME_HERO");
    expect(DELIVERY_AD_OPEN_EVENT_PACKAGE_PRICES_PHP_MAJOR.store_sponsored.STORES_HOME_FEED[7]).toBe(
      120
    );
    expect(DELIVERY_AD_OPEN_EVENT_PARTNER.monthlyFeePhpMajor).toBe(120);
    expect(DELIVERY_AD_OPEN_EVENT_PARTNER.advertisingDiscountPercent).toBe(15);
  });

  it("Admin commercial shows open-event + grandfather + unset warning", () => {
    const src = read("components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx");
    expect(src).toContain("DELIVERY_AD_OPEN_EVENT_COMMERCIAL");
    expect(src).toContain("data-commercial-open-event-notice");
    expect(src).toContain("data-commercial-unset-warning-count");
    expect(src).toContain("가격 미설정");
    expect(src).toContain("판매 불가");
    expect(src).toContain("grandfatherKo");
  });

  it("countUnsetSellablePackageSlots treats null/disabled as unset", () => {
    expect(
      countUnsetSellablePackageSlots({
        packages: [
          { priceAmountMinor: 12000, enabled: true },
          { priceAmountMinor: null, enabled: true },
          { priceAmountMinor: 100, enabled: false },
        ],
      })
    ).toBe(2);
  });

  it("banner pixel guide HOME 39:16 / SEARCH 3:1", () => {
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO.ratioLabel).toBe("39:16");
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO.recommendedWidth).toBe(1560);
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_SEARCH_TOP.ratioLabel).toBe("3:1");
    expect(formatBannerPixelGuideLine(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO, "ko")).toContain(
      "1560×640"
    );
  });

  it("Owner banner single-page + Business Cash numeric confirm", () => {
    const banner = read("components/business/owner/ads/OwnerBannerCreateView.tsx");
    expect(banner).toContain('data-owner-ads-wizard="single-page"');
    expect(banner).toContain("cashBreakdown");
    expect(banner).toContain("광고 신청");
    const confirm = read("components/stores/advertising/DeliveryAdOwnerApplicationConfirm.tsx");
    expect(confirm).toContain('data-owner-ads-confirm-cash="numeric"');
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain('data-owner-ads-business-cash="card"');
  });

  it("Owner upload route exists and Admin nav separates primary create", () => {
    const route = read(
      "app/api/me/stores/[storeId]/delivery-ads/upload-banner-image/route.ts"
    );
    expect(route).toContain("_owner/delivery-ads/banner");
    expect(route).toContain("validateOwnerBannerCreativeAspect");
    const nav = read("components/admin/stores/AdminDeliveryAdsSectionNav.tsx");
    expect(nav).toContain('data-admin-delivery-ads-nav-layout="tabs-plus-primary"');
  });
});
