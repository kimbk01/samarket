/**
 * @vitest-environment node
 * CUT 2 — Banner placement capability registry + host parity.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVENT_BANNER_CAPABILITY_MATRIX,
  eventBannerImageGuidance,
  getEventBannerCapability,
  isEventBannerOrientationEligible,
  isEventBannerPlacementPresentationCompatible,
  listEventBannerPlacementsForPresentation,
  listEventBannerPresentations,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import { planBannerDistributionAdapter } from "@/lib/platform-promotion-distribution/adapters";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("CUT2 capability registry matrix", () => {
  it("legal 2×2 ALLOW; CATEGORY/TOPIC/STORES denied", () => {
    for (const placement of ["TRADE_HOME", "COMMUNITY_HOME"] as const) {
      for (const presentation of listEventBannerPresentations()) {
        expect(isEventBannerPlacementPresentationCompatible(placement, presentation)).toBe(true);
        const cap = getEventBannerCapability(placement, presentation);
        expect(cap?.orientationPolicy).toBe("allow_all");
      }
    }
    expect(isEventBannerPlacementPresentationCompatible("TRADE_CATEGORY", "INLINE_BANNER")).toBe(
      false
    );
    expect(isEventBannerPlacementPresentationCompatible("COMMUNITY_TOPIC", "HERO_BANNER")).toBe(
      false
    );
    expect(isEventBannerPlacementPresentationCompatible("STORES_HOME", "HERO_BANNER")).toBe(false);
    expect(isEventBannerOrientationEligible("landscape")).toBe(true);
    expect(isEventBannerOrientationEligible("portrait")).toBe(true);
  });

  it("INLINE = 3:1; HERO = 39:16; host ownership distinct", () => {
    const inline = getEventBannerCapability("TRADE_HOME", "INLINE_BANNER");
    const hero = getEventBannerCapability("COMMUNITY_HOME", "HERO_BANNER");
    expect(inline).toMatchObject({
      aspectW: 3,
      aspectH: 1,
      hostId: "FeedAdBannerCarousel",
      fit: "cover",
    });
    expect(hero).toMatchObject({
      aspectW: 39,
      aspectH: 16,
      hostId: "EventPromotionHeroBanner",
      fit: "cover",
    });
    expect(EVENT_BANNER_CAPABILITY_MATRIX).toHaveLength(4);
  });

  it("adapter still DENY unsupported; HERO materializeFeedAd false (paid write path closed)", () => {
    const bad = planBannerDistributionAdapter({
      eventId: "e",
      eventTitle: "t",
      enabled: true,
      config: { presentation: "HERO_BANNER", placement: "DELIVERY" },
    });
    expect(bad.ok).toBe(false);
    const hero = planBannerDistributionAdapter({
      eventId: "e",
      eventTitle: "t",
      enabled: true,
      config: {
        presentation: "HERO_BANNER",
        placement: "COMMUNITY_HOME",
        imageUrl: "https://cdn.example/h.webp",
      },
    });
    expect(hero.ok).toBe(true);
    if (hero.ok) {
      expect(hero.value.materializeFeedAd).toBe(false);
      expect(hero.value.source).toBe("ADMIN_DIRECT");
    }
  });
});

describe("CUT2 Admin + App host parity from registry", () => {
  it("Admin options derive from listEventBanner* (no hardcoded TRADE/COMMUNITY option pair alone)", () => {
    const admin = readRepo(
      "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"
    );
    expect(admin).toContain("listEventBannerPresentations");
    expect(admin).toContain("listEventBannerPlacementsForPresentation");
    expect(admin).toContain("data-admin-banner-placement-from-registry");
    expect(admin).toContain("eventBannerImageGuidance");
    expect(admin).toContain("tablet_landscape");
    expect(admin).toContain("가로에서도 노출");
    expect(listEventBannerPlacementsForPresentation("HERO_BANNER")).toEqual([
      "TRADE_HOME",
      "COMMUNITY_HOME",
    ]);
  });

  it("Community HERO host mounts EventPromotionHeroBanner COMMUNITY_HOME", () => {
    const feed = readRepo("components/community/CommunityFeed.tsx");
    expect(feed).toContain("EventPromotionHeroBanner");
    expect(feed).toContain('placement="COMMUNITY_HOME"');
    expect(feed).toContain('data-community-event-hero-host="1"');
  });

  it("Trade HERO host mounts EventPromotionHeroBanner TRADE_HOME", () => {
    const trade = readRepo("components/home/HomeProductList.tsx");
    expect(trade).toContain("EventPromotionHeroBanner");
    expect(trade).toContain('placement="TRADE_HOME"');
    expect(trade).toContain('data-trade-event-hero-host="1"');
  });

  it("INLINE/HERO geometry contracts remain distinct in source", () => {
    const feedGeom = readRepo("lib/ads/feed-ad-geometry.ts");
    const hero = readRepo("components/platform-events/EventPromotionHeroBanner.tsx");
    expect(feedGeom).toContain("aspect-[3/1]");
    expect(hero).toContain("STORES_HOME_HERO");
    expect(hero).toContain('data-paid-side-effect="0"');
    expect(hero).toContain("recordPromotionContentVisitClient");
    expect(eventBannerImageGuidance("INLINE_BANNER", "ko")).toContain("3:1");
    expect(eventBannerImageGuidance("HERO_BANNER", "ko")).toContain("39:16");
  });
});
