/**
 * 2026-10-29 홈 화면 구성 재감사 §H-A — 선반 독립 배정(Owner) · 관리자 배정=고객 배정 · 슬롯별 소스 · PHT 기간.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  coerceDataSourceForSlot,
  dataSourcesAllowedForSlot,
  presentationsAllowedForDataSource,
} from "@/lib/stores/product/stores-home-data-source";
import { isoToPhtDateTimeLocal, phtDateTimeLocalToIso } from "@/lib/stores/product/stores-home-shelf-schedule-pht";
import { allocateHomeShelvesForAdmin, applyHomeShelfDrafts } from "@/lib/stores/product/stores-home-shelf-draft-allocation";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function item(id: string, over: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id, slug: id, nameKo: id, tagline: null, primarySlug: "restaurant", primaryNameKo: "음식", regionLabel: "Manila",
    status: "open", rating: 4.5, reviewCount: 10, deliveryAvailable: true, pickupAvailable: true, minOrderLabel: null,
    estPrepLabel: "20분", prepMinutes: 20, rideMinutes: 15, etaLabel: "약 25~35분", deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null, paymentMethodsLine: "", distanceKm: 1.2,
    featuredItems: [{ productId: `p-${id}`, name: "메뉴", price: 300 }], profileImageUrl: null, isFeatured: false,
    commerce: {
      minOrderPhp: null, deliveryFeePhp: null, freeDeliveryOverPhp: null, deliveryCourierLabel: null, deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null, prepMinutes: 20, estPrepLabel: "20분", deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null, paymentMethodsConfig: null,
    },
    firstListedAt: null,
    ...over,
  };
}

describe("Owner: each shelf is filled independently from its own data source", () => {
  const stores = [item("a"), item("b"), item("c")];
  const opts = {
    shelfLed: true,
    purposeAllocationOrder: ["slot0Food", "campaignFood", "slot4Food"] as const,
    slotDataSources: { slot0Food: "order_now", campaignFood: "order_now", slot4Food: "order_now", slot6RestStores: "rest_stores" } as const,
  };

  it("a later shelf is not emptied by stores/products an earlier shelf already showed", () => {
    const c = composeStoresHomeFeed(stores, { ...opts, purposeAllocationOrder: [...opts.purposeAllocationOrder], slotDataSources: { ...opts.slotDataSources } });
    expect(c.slot0Food.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
    expect(c.campaignFood.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
    expect(c.slot4Food.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
  });

  it("더 많은 매장 lists every store of its source, regardless of shelves above", () => {
    const c = composeStoresHomeFeed(stores, { ...opts, purposeAllocationOrder: [...opts.purposeAllocationOrder], slotDataSources: { ...opts.slotDataSources } });
    expect(c.slot6RestStores.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("HA-9 shelf-led config with no food shelf on keeps the admin config (no legacy fallback)", () => {
    const c = composeStoresHomeFeed(stores, { shelfLed: true, purposeAllocationOrder: [], slotDataSources: { slot6RestStores: "rest_stores" } });
    expect(c.slot0Food).toEqual([]);
    expect(c.slot6RestStores).toHaveLength(3);
    expect(read("lib/stores/composition/stores-composition-live.ts")).toContain("shelfLed: true,");
  });
});

describe("HA-4 / HA-5 slot-specific choices", () => {
  it("food shelves cannot pick 「나머지 매장」; rest shelf can filter by any source", () => {
    expect(dataSourcesAllowedForSlot("slot2Food")).not.toContain("rest_stores");
    expect(dataSourcesAllowedForSlot("slot6RestStores")).toContain("rest_stores");
    expect(coerceDataSourceForSlot("slot2Food", "rest_stores")).toBe("popular_menu");
  });
  it("rest shelf presentations are only the ones its renderer draws", () => {
    expect(presentationsAllowedForDataSource("rest_stores")).not.toContain("high_rating_horizontal");
  });
});

describe("HA-6 schedule is entered and shown in PHT", () => {
  it("datetime-local → +08:00 ISO and back", () => {
    expect(phtDateTimeLocalToIso("2026-10-29T10:00")).toBe("2026-10-29T10:00:00+08:00");
    expect(isoToPhtDateTimeLocal("2026-10-29T02:00:00+00:00")).toBe("2026-10-29T10:00");
    expect(isoToPhtDateTimeLocal("2026-10-29T10:00:00+08:00")).toBe("2026-10-29T10:00");
    expect(phtDateTimeLocalToIso("")).toBeNull();
  });
});

describe("HA-1 / HA-7 admin counts come from the customer allocation", () => {
  const shelf = (shelfId: string, slot: StoresHomeShelfResolvedConfig["composerSlot"], ds: StoresHomeShelfResolvedConfig["dataSource"], order: number): StoresHomeShelfResolvedConfig => ({
    shelfId, composerSlot: slot, availability: "available", unavailableReasonKo: null, unavailableReasonEn: null, enabled: true, order, max: 2,
    titleKo: shelfId, titleEn: shelfId, subtitleKo: null, subtitleEn: null, presentation: "food_horizontal", dataSource: ds,
    couponIntegration: "off", adIntegration: "off", scheduleStart: null, scheduleEnd: null, customerVisible: true,
    supportsCouponIntegration: false, supportsAdIntegration: false, productConfig: { dataSource: ds } as StoresHomeShelfResolvedConfig["productConfig"],
  });

  it("allocated count respects max and the shelf's own source; drafts recompute visibility", () => {
    const stores = [item("a"), item("b"), item("c", { isFeatured: true })];
    const saved = [shelf("s0", "slot0Food", "order_now", 1), shelf("s5", "slot5Food", "recommended", 2)];
    const alloc = allocateHomeShelvesForAdmin(stores, null, saved);
    expect(alloc.s0).toMatchObject({ candidateCount: 3, allocatedCount: 2, customerVisible: true });
    expect(alloc.s5).toMatchObject({ candidateCount: 1, allocatedCount: 1, customerVisible: true });
    const drafted = applyHomeShelfDrafts(saved, [{ ...saved[1]!, enabled: false, scheduleStart: null, scheduleEnd: null }]);
    expect(drafted[1]!.customerVisible).toBe(false);
    expect(allocateHomeShelvesForAdmin(stores, null, drafted).s5!.hiddenReason).toBe("disabled");
  });

  it("the admin list and the live preview use these helpers", () => {
    const page = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
    expect(page).toContain("allocateHomeShelvesForAdmin(homeFeedStores, homeFeedPolicyMeta, draftShelfConfigs)");
    expect(page).toContain("draftShelves={draftShelfConfigs}");
    expect(page).not.toContain("allocatedCount: candidateCount");
  });
});
