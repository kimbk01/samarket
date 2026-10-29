import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import {
  coercePresentationForDataSource,
  presentationsAllowedForDataSource,
  diagnoseHomeShelfCustomerHidden,
} from "@/lib/stores/product/stores-home-data-source";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  parseExplicitBrowseSortParam,
  resolveBrowseFetchSort,
} from "@/lib/stores/browse-list-sort-scope";
import { resolveCouponBadgeAllowed } from "@/lib/stores/store-coupon-eligibility";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

function item(partial: Partial<StoreHomeFeedItem> & { id: string }): StoreHomeFeedItem {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    nameKo: partial.nameKo ?? "매장",
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: partial.status ?? "open",
    rating: partial.rating ?? 4.5,
    reviewCount: partial.reviewCount ?? 10,
    deliveryAvailable: partial.deliveryAvailable ?? true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 15,
    etaLabel: "약 25~35분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: 1.2,
    featuredItems: partial.featuredItems ?? [{ productId: `p-${partial.id}`, name: "치킨", price: 500 }],
    platformPopularProducts: partial.platformPopularProducts,
    profileImageUrl: null,
    isFeatured: partial.isFeatured ?? false,
    commerce: {
      minOrderPhp: null,
      deliveryFeePhp: null,
      freeDeliveryOverPhp: null,
      deliveryCourierLabel: null,
      deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null,
      prepMinutes: 20,
      estPrepLabel: "20분",
      deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null,
      paymentMethodsConfig: null,
    },
    completedOrderCount30d: partial.completedOrderCount30d,
    discoveryEligibilityRank: partial.discoveryEligibilityRank,
    firstListedAt: partial.firstListedAt ?? null,
    discoveryCampaign: partial.discoveryCampaign,
  };
}

const NOW = Date.parse("2026-08-25T00:00:00.000Z");
const NEW_AT = "2026-08-20T00:00:00.000Z";

describe("HOME discovery control", () => {
  it("H1 dataSource new_store uses new membership", () => {
    const composition = composeStoresHomeFeed(
      [
        item({ id: "old", firstListedAt: "2020-01-01T00:00:00.000Z", completedOrderCount30d: 9 }),
        item({ id: "fresh", firstListedAt: NEW_AT }),
      ],
      {
        nowMs: NOW,
        purposeAllocationOrder: ["newStoreFood"],
        slotDataSources: { newStoreFood: "new_store" },
      }
    );
    expect(composition.newStoreFood.map((e) => e.storeId)).toEqual(["fresh"]);
  });

  it("H2 dataSource high_rating uses rating membership", () => {
    const composition = composeStoresHomeFeed(
      [
        item({ id: "low", rating: 3, reviewCount: 1 }),
        item({ id: "hi", rating: 4.8, reviewCount: 20 }),
      ],
      {
        purposeAllocationOrder: ["slot4Food"],
        slotDataSources: { slot4Food: "high_rating" },
      }
    );
    expect(composition.slot4Food.map((e) => e.storeId)).toEqual(["hi"]);
  });

  it("H3 source change changes candidate set", () => {
    const stores = [
      item({ id: "hi", rating: 4.9, reviewCount: 20, firstListedAt: "2020-01-01T00:00:00.000Z" }),
      item({ id: "fresh", rating: 3, reviewCount: 1, firstListedAt: NEW_AT }),
    ];
    const asNew = composeStoresHomeFeed(stores, {
      nowMs: NOW,
      purposeAllocationOrder: ["slot0Food"],
      slotDataSources: { slot0Food: "new_store" },
    });
    const asRating = composeStoresHomeFeed(stores, {
      nowMs: NOW,
      purposeAllocationOrder: ["slot0Food"],
      slotDataSources: { slot0Food: "high_rating" },
    });
    expect(asNew.slot0Food.map((e) => e.storeId)).toEqual(["fresh"]);
    expect(asRating.slot0Food.map((e) => e.storeId)).toEqual(["hi"]);
  });

  it("H5 max caps allocated length", () => {
    const stores = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
    const composition = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot0Food"],
      slotDataSources: { slot0Food: "order_now" },
      slotMax: { slot0Food: 1 },
    });
    expect(composition.slot0Food).toHaveLength(1);
  });

  it("H6 section_order is allocation priority", () => {
    const stores = [
      item({ id: "both", rating: 4.9, reviewCount: 20, completedOrderCount30d: 5 }),
    ];
    const ratingFirst = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot4Food", "slot2Food"],
      slotDataSources: { slot4Food: "high_rating", slot2Food: "popular_menu" },
    });
    const popularFirst = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot2Food", "slot4Food"],
      slotDataSources: { slot4Food: "high_rating", slot2Food: "popular_menu" },
    });
    expect(ratingFirst.slot4Food.map((e) => e.storeId)).toEqual(["both"]);
    expect(popularFirst.slot2Food.map((e) => e.storeId)).toEqual(["both"]);
  });

  it("H7 empty source diagnoses hidden", () => {
    const d = diagnoseHomeShelfCustomerHidden({
      unavailable: false,
      enabled: true,
      scheduleOk: true,
      candidateCount: 0,
      allocatedCount: 0,
    });
    expect(d.customerVisible).toBe(false);
    expect(d.hiddenReason).toBe("empty_candidate");
  });

  it("H8 food source cannot select timesale_vertical", () => {
    expect(presentationsAllowedForDataSource("new_store")).not.toContain("timesale_vertical");
    expect(coercePresentationForDataSource("new_store", "timesale_vertical")).toBe("food_horizontal");
  });

  it("H-dup same source two instances does not starve the second", () => {
    const stores = [item({ id: "fresh", firstListedAt: NEW_AT })];
    const composition = composeStoresHomeFeed(stores, {
      nowMs: NOW,
      purposeAllocationOrder: ["newStoreFood", "slot5Food"],
      slotDataSources: { newStoreFood: "new_store", slot5Food: "new_store" },
    });
    expect(composition.newStoreFood.map((e) => e.storeId)).toEqual(["fresh"]);
    expect(composition.slot5Food.map((e) => e.storeId)).toEqual(["fresh"]);
  });
});

describe("BROWSE discovery control", () => {
  it("B1–B3 defaultSort primary / inherit / secondary cannot override", () => {
    const primary = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: null,
      primaryRow: {
        scopeKey: "restaurant",
        primarySlug: "restaurant",
        subSlug: null,
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: false,
        couponEnabled: false,
        maxInsertion: null,
        intervalEveryN: 8,
        presentationMode: "card_benefit_integrated",
        scheduleStart: null,
        scheduleEnd: null,
        productConfig: { defaultSort: "popular" },
      },
      subRow: null,
    });
    expect(primary.defaultSort).toBe("popular");

    const inherit = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: {
        scopeKey: "restaurant",
        primarySlug: "restaurant",
        subSlug: null,
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: false,
        couponEnabled: false,
        maxInsertion: null,
        intervalEveryN: 8,
        presentationMode: "card_benefit_integrated",
        scheduleStart: null,
        scheduleEnd: null,
        productConfig: { defaultSort: "popular" },
      },
      subRow: null,
    });
    expect(inherit.defaultSort).toBe("popular");

    const override = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: {
        scopeKey: "restaurant",
        primarySlug: "restaurant",
        subSlug: null,
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: false,
        couponEnabled: false,
        maxInsertion: null,
        intervalEveryN: 8,
        presentationMode: "card_benefit_integrated",
        scheduleStart: null,
        scheduleEnd: null,
        productConfig: { defaultSort: "popular" },
      },
      subRow: {
        scopeKey: "restaurant/korean",
        primarySlug: "restaurant",
        subSlug: "korean",
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: "inherit",
        couponEnabled: "inherit",
        maxInsertion: "inherit",
        intervalEveryN: "inherit",
        presentationMode: "inherit",
        scheduleStart: "inherit",
        scheduleEnd: "inherit",
        productConfig: { defaultSort: "rating" },
      },
    });
    expect(override.defaultSort).toBe("popular");
  });

  it("B4 explicit customer sort wins over admin default", () => {
    expect(parseExplicitBrowseSortParam(null)).toBeNull();
    expect(resolveBrowseFetchSort("rating", "popular", true)).toBe("rating");
    expect(resolveBrowseFetchSort(null, "popular", true)).toBe("popular");
  });

  it("B5 ad interval/max uses planner", () => {
    const policy: StoresCompositionSectionContract[] = [
      {
        surface: "browse",
        slot: "organic_discovery_list",
        contentType: "store",
        enabled: true,
        order: 0,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
        max: null,
        titleAuthority: "none",
      },
      {
        surface: "browse",
        slot: "future_ad_insertion",
        contentType: "ad",
        enabled: true,
        order: 1,
        interval: { consumed: true, everyN: 2 },
        max: 1,
        titleAuthority: "none",
      },
    ];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: ["a", "b", "c", "d"],
      paidAds: [
        {
          id: "ad1",
          storeId: "a",
          placement: "stores_browse",
          title: "ad",
          headline: "h",
          bodyCopy: null,
          imageUrl: null,
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2026-12-01T00:00:00.000Z",
          isActive: true,
        },
      ],
      policy,
      paidAdsEnabled: true,
    });
    expect(plan.adCount).toBe(1);
    expect(plan.organicIds).toEqual(["a", "b", "c", "d"]);
  });

  it("B6 coupon badge gate", () => {
    expect(resolveCouponBadgeAllowed({ browseCouponEnabled: false })).toBe(false);
    expect(resolveCouponBadgeAllowed({ browseCouponEnabled: true })).toBe(true);
  });

  it("B7 organic order preserved by insertion", () => {
    const policy: StoresCompositionSectionContract[] = [
      {
        surface: "browse",
        slot: "organic_discovery_list",
        contentType: "store",
        enabled: true,
        order: 0,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
        max: null,
        titleAuthority: "none",
      },
      {
        surface: "browse",
        slot: "future_ad_insertion",
        contentType: "ad",
        enabled: true,
        order: 1,
        interval: { consumed: true, everyN: 2 },
        max: 1,
        titleAuthority: "none",
      },
    ];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: ["a", "b", "c"],
      paidAds: [
        {
          id: "ad1",
          storeId: "z",
          placement: "stores_browse",
          title: "ad",
          headline: "h",
          bodyCopy: null,
          imageUrl: null,
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: "2026-12-01T00:00:00.000Z",
          isActive: true,
        },
      ],
      policy,
      paidAdsEnabled: true,
    });
    const organic = plan.rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
    expect(organic).toEqual(["a", "b", "c"]);
  });
});
