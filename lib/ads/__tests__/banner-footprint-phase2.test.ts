import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FEED_AD_CONTENT_MAX_CLASS,
  FEED_AD_CONTENT_MAX_WIDTH_PX,
  FEED_AD_MEDIA_ASPECT_CLASS,
  estimateFeedAdMediaHeightWithinContentMaxPx,
  feedAdFrameClass,
} from "@/lib/ads/feed-ad-geometry";
import { STORES_HOME_CONTENT_COLUMN_CLASS } from "@/lib/stores/stores-home-ui";
import { DELIVERY_AD_BANNER_CONTENT_MAX_CLASS } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  EVENT_BANNER_CAPABILITY_MATRIX,
  isEventBannerOrientationEligible,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import {
  adminBannerPreviewDeviceOuterWidthPx,
  adminTradeInlinePreviewCellWidthPx,
} from "@/lib/admin/admin-banner-preview-geometry";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(`${ROOT}/${p}`, "utf8");

describe("Phase 2 banner footprint / host-width authority", () => {
  it("INLINE aspect stays 3:1; HERO stays 39:16", () => {
    expect(FEED_AD_MEDIA_ASPECT_CLASS).toBe("aspect-[3/1]");
    const inline = EVENT_BANNER_CAPABILITY_MATRIX.filter((r) => r.presentation === "INLINE_BANNER");
    const hero = EVENT_BANNER_CAPABILITY_MATRIX.filter((r) => r.presentation === "HERO_BANNER");
    expect(inline.every((r) => r.aspectW === 3 && r.aspectH === 1)).toBe(true);
    expect(hero.every((r) => r.aspectW === 39 && r.aspectH === 16)).toBe(true);
  });

  it("canonical width owner is STORES_HOME content column (shared with Delivery/Hero)", () => {
    expect(FEED_AD_CONTENT_MAX_CLASS).toBe(STORES_HOME_CONTENT_COLUMN_CLASS);
    expect(DELIVERY_AD_BANNER_CONTENT_MAX_CLASS).toBe(STORES_HOME_CONTENT_COLUMN_CLASS);
    expect(FEED_AD_CONTENT_MAX_WIDTH_PX).toBe(768);
    expect(feedAdFrameClass("community")).toContain(FEED_AD_CONTENT_MAX_CLASS);
  });

  it("landscape remains ALLOW for Banner; no orientation height patch in geometry", () => {
    expect(isEventBannerOrientationEligible("landscape")).toBe(true);
    expect(isEventBannerOrientationEligible("portrait")).toBe(true);
    const geometry = read("lib/ads/feed-ad-geometry.ts");
    expect(geometry).not.toMatch(/orientation:\s*landscape|max-height:\s*\d+vh|@media.*landscape/);
    expect(geometry).not.toMatch(/Samsung|Redmi|userAgent|innerWidth/);
  });

  it("four hosts remain single (no duplicate)", () => {
    const community = read("components/community/CommunityFeed.tsx");
    const trade = read("components/home/HomeProductList.tsx");
    expect(community).toContain("FeedAdBannerCarousel");
    expect(community.match(/data-community-event-hero-host="1"/g)?.length).toBe(1);
    expect(trade.match(/data-trade-event-hero-host="1"/g)?.length).toBe(1);
    expect(trade).toContain("FeedAdBannerCarousel");
  });

  it("wide host INLINE height is bounded by content max (before→after proof numbers)", () => {
    // BEFORE (unbounded host width ≈ APP_MAIN xl): height = 1056/3
    const beforeH = 1056 / 3;
    expect(beforeH).toBe(352);
    // AFTER: content max 768 → 256
    expect(estimateFeedAdMediaHeightWithinContentMaxPx(1056)).toBe(256);
    expect(estimateFeedAdMediaHeightWithinContentMaxPx(1024)).toBe(256);
    // Phone host unchanged
    expect(estimateFeedAdMediaHeightWithinContentMaxPx(334)).toBeCloseTo(111.333, 2);
  });

  it("Admin preview uses real device outer widths and Trade grid-cell host", () => {
    expect(adminBannerPreviewDeviceOuterWidthPx("tablet_landscape")).toBe(1024);
    expect(adminBannerPreviewDeviceOuterWidthPx("desktop")).toBe(1280);
    expect(adminTradeInlinePreviewCellWidthPx("phone")).toBeLessThan(200);
    const dist = read(
      "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"
    );
    expect(dist).toContain("adminBannerPreviewDeviceOuterWidthPx");
    expect(dist).toContain("adminTradeInlinePreviewCellWidthPx");
    expect(dist).not.toMatch(/Math\.min\([\s\S]*720/);
  });

  it("empty hosts collapse (return null) — no reserved aspect box", () => {
    const carousel = read("components/ads/FeedAdBannerCarousel.tsx");
    const hero = read("components/platform-events/EventPromotionHeroBanner.tsx");
    expect(carousel).toMatch(/campaigns\.length === 0[\s\S]*return null/);
    expect(hero).toMatch(/!item\?\.imageUrl[\s\S]*return null/);
  });

  it("destination / content_visit / billing contracts unchanged", () => {
    const hero = read("components/platform-events/EventPromotionHeroBanner.tsx");
    expect(hero).toContain("recordPromotionContentVisitClient");
    expect(hero).toContain('data-paid-side-effect="0"');
    expect(hero).toContain('sourceChannel: "BANNER"');
    const save = read("lib/platform-promotion-distribution/save-event-distribution.ts");
    expect(save).toContain('source: "ADMIN_DIRECT"');
  });

  it("Phase 1 ownership visibility module still present", () => {
    const vis = read("lib/admin/promotion-ownership-visibility.ts");
    expect(vis).toContain("resolvePopupListCompositionLabel");
    expect(vis).toContain("inlineSharesPlacementCopy");
  });

  it("Popup landscape policy file not rewritten by this Phase", () => {
    // Smoke: Banner orientation allow stays in banner-presentation; popup policy elsewhere
    const banner = read("lib/platform-promotion-distribution/banner-presentation.ts");
    expect(banner).toContain('orientationPolicy: "allow_all"');
  });
});
