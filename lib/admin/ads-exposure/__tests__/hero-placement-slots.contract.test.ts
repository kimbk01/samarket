import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DELIVERY_HERO_CAPACITY } from "@/lib/admin/ads-exposure/capacity-gate";
import { projectHeroPlacementSlots } from "@/lib/admin/ads-exposure/hero-placement-slots";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("hero-placement-slots contract", () => {
  it("shares HERO booking authority and sort order", () => {
    const source = read("lib/admin/ads-exposure/hero-placement-slots.ts");
    const capacitySource = read("lib/admin/ads-exposure/capacity-gate.ts");

    expect(source).toContain("loadHeroOccupancyCampaigns");
    expect(source).toContain("STORE_BANNER_AD_CAMPAIGN_TABLE");
    expect(source).toContain("HERO_OCCUPYING_LIFECYCLES");
    expect(source).toContain("sortOrder");
    expect(capacitySource).toContain("delivery_banner_campaign_inventories");
    expect(capacitySource).toContain("sort_order");
  });

  it("always projects exactly the HERO capacity", () => {
    const slots = projectHeroPlacementSlots([
      {
        id: "campaign-1",
        storeId: null,
        storeName: "Direct campaign",
        title: "Hero",
        inventoryKeys: ["STORES_HOME_HERO"],
        lifecycleStatus: "SCHEDULED",
        startAt: "2026-09-10T00:00:00.000Z",
        endAt: "2026-09-20T00:00:00.000Z",
        creativeId: null,
        capacity: DELIVERY_HERO_CAPACITY,
        ownerUserId: null,
        imageUrl: "https://example.com/hero.webp",
        campaignSource: "DIBAY_FIRST_PARTY",
        sortOrder: 2,
      },
    ]);

    expect(slots).toHaveLength(DELIVERY_HERO_CAPACITY);
    expect(slots[0]).toMatchObject({ slideIndex: 1, occupied: true, campaignId: "campaign-1" });
    expect(slots[4]).toMatchObject({ slideIndex: 5, occupied: false, campaignId: null });
  });

  it("placement HERO slides do not depend on control-plane execution rows", () => {
    const view = read("components/admin/ads/AdminAdsPlacementManagementView.tsx");
    expect(view).not.toContain("model.currentExecution");
    expect(view).toContain("/api/admin/advertising/hero-placement-slots");
    expect(view).toContain("/api/admin/advertising/reorder-hero-banners");
  });
});
