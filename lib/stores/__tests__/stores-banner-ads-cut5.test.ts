import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STORE_BANNER_AD_CAMPAIGN_TABLE,
  compareStoreBannerAdCampaigns,
  type StoreBannerAdCampaignRow,
} from "@/lib/stores/store-banner-ad-campaign-authority";
import {
  resolveStoreBannerAdVisibility,
  selectVisibleStoreBannerAdCampaigns,
} from "@/lib/stores/store-banner-ad-exposure";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import { STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS } from "@/lib/stores/discovery-authority/monetization";

const nowMs = Date.parse("2026-06-15T12:00:00.000Z");

const baseBanner = (
  overrides: Partial<StoreBannerAdCampaignRow> & Pick<StoreBannerAdCampaignRow, "id">
): StoreBannerAdCampaignRow => ({
  id: overrides.id,
  surface: overrides.surface ?? "stores_home_hero",
  title: overrides.title ?? "Title",
  subtitle: overrides.subtitle ?? null,
  imageUrl: overrides.imageUrl ?? "https://cdn.example/banner.jpg",
  ctaHref: overrides.ctaHref ?? "/stores/browse/restaurant",
  sortOrder: overrides.sortOrder ?? 0,
  startAt: overrides.startAt ?? "2026-06-01T00:00:00.000Z",
  endAt: overrides.endAt ?? "2026-07-01T00:00:00.000Z",
  isActive: overrides.isActive ?? true,
});

describe("CUT 5 store banner ads", () => {
  it("T1 active valid HOME banner visible", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({ id: "b1" }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.visible).toBe(true);
    expect(r.blockingReasons).toEqual([]);
    expect(r.imageUrl).toBeTruthy();
  });

  it("T2 inactive banner hidden", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({ id: "b1", isActive: false }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.visible).toBe(false);
    expect(r.blockingReasons).toContain("campaignActive");
  });

  it("T3 future banner hidden", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({
        id: "b1",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.visible).toBe(false);
    expect(r.blockingReasons).toContain("windowActive");
  });

  it("T4 expired banner hidden", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({
        id: "b1",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
      }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.visible).toBe(false);
    expect(r.blockingReasons).toContain("windowActive");
  });

  it("T5 wrong surface hidden", () => {
    const campaign = {
      ...baseBanner({ id: "b1" }),
      surface: "stores_browse" as unknown as StoreBannerAdCampaignRow["surface"],
    };
    const r = resolveStoreBannerAdVisibility({
      campaign,
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.visible).toBe(false);
    expect(r.blockingReasons).toContain("surfaceMatched");
  });

  it("T5b surfaceMatched true for stores_home_hero", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({ id: "b1" }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.factors.surfaceMatched).toBe(true);
  });

  it("T6 missing image hidden", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({ id: "b1", imageUrl: "   " }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.visible).toBe(false);
    expect(r.blockingReasons).toContain("creativeValid");
  });

  it("T7 deterministic ordering", () => {
    const campaigns = [
      baseBanner({ id: "c", sortOrder: 2, startAt: "2026-06-10T00:00:00.000Z" }),
      baseBanner({ id: "a", sortOrder: 1, startAt: "2026-06-01T00:00:00.000Z" }),
      baseBanner({ id: "b", sortOrder: 1, startAt: "2026-06-05T00:00:00.000Z" }),
    ];
    const sorted = [...campaigns].sort(compareStoreBannerAdCampaigns);
    expect(sorted.map((c) => c.id)).toEqual(["b", "a", "c"]);
    const { visible } = selectVisibleStoreBannerAdCampaigns({
      campaigns,
      targetSurface: "stores_home_hero",
      nowMs,
    });
    expect(visible.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });

  it("T8 CTA/deeplink canonical", () => {
    const r = resolveStoreBannerAdVisibility({
      campaign: baseBanner({ id: "b1", ctaHref: "/stores/browse/mart?sub=all" }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(r.ctaHref).toBe("/stores/browse/mart?sub=all");
    const empty = resolveStoreBannerAdVisibility({
      campaign: baseBanner({ id: "b2", ctaHref: "  " }),
      nowMs,
      targetSurface: "stores_home_hero",
    });
    expect(empty.ctaHref).toBe("");
  });

  it("T9 Hero consumes one Banner authority", () => {
    const heroSrc = readFileSync(
      join(process.cwd(), "components/stores/home/hub/StoresHomeHeroBanner.tsx"),
      "utf8"
    );
    expect(heroSrc).toMatch(/\/api\/stores\/home-hero-banners/);
    expect(heroSrc).not.toMatch(/STORES_HOME_HERO_SLIDES/);
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).toBe("store_banner_ad_campaigns");
  });

  it("T10 static Hero dual authority 없음", () => {
    const heroSrc = readFileSync(
      join(process.cwd(), "components/stores/home/hub/StoresHomeHeroBanner.tsx"),
      "utf8"
    );
    expect(heroSrc).not.toContain("STORES_HOME_HERO_SLIDES");
    expect(heroSrc).not.toContain("stores-home-hero-slides");
    const slidesSrc = readFileSync(
      join(process.cwd(), "lib/stores/stores-home-hero-slides.ts"),
      "utf8"
    );
    expect(slidesSrc).toMatch(/@deprecated|REMOVED as runtime/);
  });

  it("T11 Paid Ads untouched", () => {
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).toBe("store_paid_ad_campaigns");
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).not.toBe(STORE_PAID_AD_CAMPAIGN_TABLE);
    const bannerExposure = readFileSync(
      join(process.cwd(), "lib/stores/store-banner-ad-exposure.ts"),
      "utf8"
    );
    expect(bannerExposure).not.toMatch(/store_paid_ad|paid-ad-exposure|rest_stores/);
  });

  it("T12 Coupons untouched", () => {
    expect(STORE_COUPON_CAMPAIGN_TABLE).toBe("store_coupon_campaigns");
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).not.toBe(STORE_COUPON_CAMPAIGN_TABLE);
  });

  it("T13 Promotions untouched", () => {
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.EDITORIAL_PROMOTION).toBe(
      "store_discovery_campaigns"
    );
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.BANNER_AD).toBe(
      STORE_BANNER_AD_CAMPAIGN_TABLE
    );
    const bannerLoad = readFileSync(
      join(process.cwd(), "lib/stores/load-store-banner-ad-campaigns.ts"),
      "utf8"
    );
    expect(bannerLoad).not.toMatch(/store_discovery_campaigns/);
  });
});
