import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  feedAdPoolCapacity,
  feedAdPoolOccupiesStatus,
} from "@/lib/ads/feed-ad-pool-capacity";
import {
  ADS_PLACEMENT_OPS_HREF,
  FEED_POOL_PLACEMENTS,
  projectFeedPoolInventories,
  projectPopupSurfaceInventory,
} from "@/lib/admin/ads-exposure/placement-inventory";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import { DELIVERY_HERO_CAPACITY } from "@/lib/admin/ads-exposure/capacity-gate";
import { FEED_AD_RECOMMENDED_UPLOAD } from "@/lib/ads/feed-ad-geometry";
import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import { DELIVERY_AD_BANNER_PIXEL_GUIDE } from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { projectHeroPlacementSlots } from "@/lib/admin/ads-exposure/hero-placement-slots";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

function campaign(
  partial: Partial<FeedAdCampaignView> & Pick<FeedAdCampaignView, "id" | "placement" | "status">
): FeedAdCampaignView {
  return {
    name: partial.name ?? "Campaign",
    domain: partial.domain ?? "community",
    targetCategoryId: null,
    targetTopicSlug: null,
    priority: 100,
    startAt: "2026-09-01T00:00:00.000Z",
    endAt: "2026-09-30T00:00:00.000Z",
    destinationType: "internal_page",
    destinationId: "",
    destinationUrl: "",
    source: "ADMIN_DIRECT",
    requestId: null,
    slides: [
      {
        id: "s1",
        sortOrder: 1,
        imageUrl: "https://cdn.example.com/b.png",
        altText: "",
        headline: "H",
        description: "",
        ctaLabel: "",
        destinationType: null,
        destinationId: "",
        destinationUrl: "",
      },
    ],
    ...partial,
  };
}

describe("CUT R5 placement inventory", () => {
  it("Feed capacity is N/3 with no fake slots", () => {
    expect(feedAdPoolCapacity("COMMUNITY_HOME")).toBe(3);
    expect(feedAdPoolCapacity("COMMUNITY_TOPIC")).toBe(3);
    expect(feedAdPoolCapacity("TRADE_HOME")).toBe(3);
    expect(feedAdPoolCapacity("TRADE_CATEGORY")).toBe(3);

    const pools = projectFeedPoolInventories([
      campaign({ id: "1", placement: "COMMUNITY_HOME", status: "active" }),
      campaign({ id: "2", placement: "COMMUNITY_HOME", status: "scheduled" }),
      campaign({ id: "draft", placement: "COMMUNITY_HOME", status: "draft" }),
      campaign({ id: "ended", placement: "COMMUNITY_HOME", status: "ended" }),
    ]);
    const home = pools.find((p) => p.placementKey === "COMMUNITY_HOME")!;
    expect(home.used).toBe(2);
    expect(home.capacity).toBe(3);
    expect(home.remaining).toBe(1);
    expect(home.status).toBe("available");
    expect(home.createHref).toBe("/admin/advertising/direct/community");
    expect(home.campaigns).toHaveLength(2);
    expect(FEED_POOL_PLACEMENTS).not.toContain("Slot 1" as never);
  });

  it("Feed occupancy ignores draft/ended; requested-only placements are not invented", () => {
    expect(feedAdPoolOccupiesStatus("active")).toBe(true);
    expect(feedAdPoolOccupiesStatus("draft")).toBe(false);
    expect(feedAdPoolOccupiesStatus("ended")).toBe(false);
    const pools = projectFeedPoolInventories([
      campaign({ id: "t1", placement: "TRADE_HOME", status: "active", domain: "trade" }),
    ]);
    const topic = pools.find((p) => p.placementKey === "COMMUNITY_TOPIC")!;
    expect(topic.used).toBe(0);
    expect(topic.campaigns).toEqual([]);
  });

  it("Delivery projects exactly 5 Slides", () => {
    expect(DELIVERY_HERO_CAPACITY).toBe(5);
    const slots = projectHeroPlacementSlots([]);
    expect(slots).toHaveLength(5);
    expect(slots.every((s, i) => s.slideIndex === i + 1)).toBe(true);
  });

  it("Popup surface projection has no fake slots; winner vs waiting separated", () => {
    const row = projectPopupSurfaceInventory({
      surface: "COMMUNITY",
      winnerCampaignId: "win-1",
      eligibleCampaignIds: ["win-1", "wait-1", "wait-2"],
      metaById: new Map([
        [
          "win-1",
          {
            id: "win-1",
            name: "Winner",
            thumbUrl: null,
            startAt: null,
            endAt: null,
          },
        ],
      ]),
    });
    expect(row.hasCurrentWinner).toBe(true);
    expect(row.currentWinner?.campaignId).toBe("win-1");
    expect(row.waitingCount).toBe(2);
    expect(row.createHref).toBe("/admin/advertising/direct/popup");
  });

  it("Creative specs come from canonical SSOT", () => {
    const pools = projectFeedPoolInventories([]);
    expect(pools[0]!.creativeSpec.aspectLabel).toBe(FEED_AD_RECOMMENDED_UPLOAD.aspectLabel);
    expect(pools[0]!.creativeSpec.pixelLabel).toContain("1200");
    expect(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO.ratioLabel).toBe("39:16");
    expect(DIBAY_CANONICAL_POPUP_CREATIVE_SIZE).toEqual({ width: 1440, height: 1000 });
  });

  it("UI routes are R2 canonical + R4 operations; unsupported controls absent", () => {
    const view = read("components/admin/ads/AdminAdsPlacementManagementView.tsx");
    const inventory = read("lib/admin/ads-exposure/placement-inventory.ts");
    expect(view).toContain('data-admin-ads-r5="1"');
    expect(inventory).toContain("/admin/advertising/direct/community");
    expect(inventory).toContain("/admin/advertising/direct/trade");
    expect(inventory).toContain("/admin/advertising/direct/delivery");
    expect(inventory).toContain("/admin/advertising/direct/popup");
    expect(view).toContain("pool.createHref");
    expect(view).toContain("hero.createBaseHref");
    expect(view).toContain("ADS_PLACEMENT_OPS_HREF");
    expect(inventory).toContain(ADS_PLACEMENT_OPS_HREF);
    expect(view).toContain("adsPlacementReorderConfirmCopy");
    expect(view).toContain('data-feed-fake-slot="0"');
    expect(view).toContain('data-popup-fake-slot="0"');
    expect(view).not.toContain("/admin/feed-ads");
    expect(view).not.toContain("/admin/platform-popup");
    expect(view).not.toContain("/admin/delivery-ads");
    expect(view).not.toContain("Feed reorder");
    expect(view).not.toContain("CHANGE_PLACEMENT");
    expect(view).toContain("이 위치에 배너 등록");
    expect(inventory).toContain("Community 배너 등록");
    expect(inventory).toContain("거래 배너 등록");
    expect(view).toContain("Popup 등록");
  });

  it("Full pool blocks create CTA copy", () => {
    const pools = projectFeedPoolInventories([
      campaign({ id: "a", placement: "TRADE_HOME", status: "active", domain: "trade" }),
      campaign({ id: "b", placement: "TRADE_HOME", status: "active", domain: "trade" }),
      campaign({ id: "c", placement: "TRADE_HOME", status: "paused", domain: "trade" }),
    ]);
    const home = pools.find((p) => p.placementKey === "TRADE_HOME")!;
    expect(home.status).toBe("full");
    expect(home.remaining).toBe(0);
    expect(home.createHref).toBe("/admin/advertising/direct/trade");
  });

  it("Delivery create slot query is request context only (no writer guarantee)", () => {
    const delivery = read("components/admin/ads/AdminAdsDirectDeliveryCreateView.tsx");
    expect(delivery).toContain('data-admin-delivery-slot-guaranteed="0"');
    expect(delivery).toContain("요청 위치");
    expect(delivery).not.toContain("선택 위치: Slide");
    expect(delivery).not.toContain("이 광고는 Slide");
  });
});
