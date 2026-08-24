/**
 * CUT 2 — HOME composition canonical section contracts (scoped).
 */
import { describe, expect, it } from "vitest";
import {
  STORES_DISCOVERY_HOME_SECTION_IDS,
  STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES,
} from "@/lib/stores/discovery-authority/home-sections";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { resolveOrderedVisibleHomeCompositionSlots } from "@/lib/stores/composition/stores-composition-home-section-order";
import {
  STORES_HOME_SHELF_PRODUCT_CATALOG,
  canonicalizeHomeShelfId,
  shelfIdToComposerSlot,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import { resolveHomeShelfProductCatalog } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import {
  composeStoresHomeFeed,
  STORES_HOME_TOP_RATED_MIN_RATING,
  STORES_HOME_TOP_RATED_MIN_REVIEWS,
} from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { isNewStoreSignal } from "@/lib/stores/store-new-store-signal";

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
    etaLabel: partial.etaLabel ?? "약 25~35분",
    deliveryFeeLabel: partial.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: partial.distanceKm ?? 1.2,
    featuredItems: partial.featuredItems ?? [
      { productId: `p-${partial.id}`, name: "치킨", price: 500 },
    ],
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

describe("CUT 2 HOME composition", () => {
  it("T1 canonical section IDs unique", () => {
    expect(new Set(STORES_DISCOVERY_HOME_SECTION_IDS).size).toBe(
      STORES_DISCOVERY_HOME_SECTION_IDS.length
    );
  });

  it("T2 main_stores runtime authority absent", () => {
    const shelves = resolveHomeShelfProductCatalog([]);
    const main = shelves.find((s) => s.shelfId === "main_stores");
    expect(main?.availability).toBe("unavailable");
    expect(main?.customerVisible).toBe(false);
    expect(shelfIdToComposerSlot("main_stores")).toBeNull();

    const composition = composeStoresHomeFeed([
      item({ id: "a", status: "open" }),
      item({ id: "b", status: "closed" }),
    ]);
    expect(composition.slot1Stores).toEqual([]);

    const policy = resolveDefaultCompositionPolicy("home");
    const ordered = resolveOrderedVisibleHomeCompositionSlots(policy, composition, shelves);
    expect(ordered.includes("slot1Stores")).toBe(false);
    expect(STORES_DISCOVERY_HOME_LEGACY_SHELF_STATES.main_stores).toBe("REMOVED_CUT2");
  });

  it("T3–T5 legacy shelf ids → canonical only", () => {
    const ids = STORES_HOME_SHELF_PRODUCT_CATALOG.map((s) => s.shelfId);
    expect(ids).toContain("popular_menu");
    expect(ids).toContain("editorial_promo");
    expect(ids).toContain("delivery_fee_benefit");
    expect(ids).not.toContain("popular");
    expect(ids).not.toContain("promo_campaign");
    expect(ids).not.toContain("delivery_fee_discount");
    expect(canonicalizeHomeShelfId("popular")).toBe("popular_menu");
    expect(canonicalizeHomeShelfId("promo_campaign")).toBe("editorial_promo");
    expect(canonicalizeHomeShelfId("delivery_fee_discount")).toBe("delivery_fee_benefit");

    const resolved = resolveHomeShelfProductCatalog([
      { shelfId: "popular", enabled: true, titleKo: "레거시제목" },
    ]);
    expect(resolved.find((s) => s.shelfId === "popular_menu")?.titleKo).toBe("레거시제목");
    expect(resolved.find((s) => s.shelfId === "popular")).toBeUndefined();
  });

  it("T6 order_now membership/ranking preserved", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "open", status: "open", deliveryAvailable: true }),
      item({ id: "closed", status: "closed", deliveryAvailable: true }),
      item({ id: "no-del", status: "open", deliveryAvailable: false }),
    ]);
    expect(composition.slot0Food.map((e) => e.storeId)).toEqual(["open"]);
  });

  it("T7 recommended membership = stores.is_featured", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "feat", isFeatured: true, status: "closed", rating: 3.2, reviewCount: 1 }),
      item({ id: "plain", isFeatured: false, status: "closed", rating: 3.2, reviewCount: 1 }),
    ]);
    expect(composition.slot5Food.map((e) => e.storeId)).toEqual(["feat"]);
  });

  it("T8 popular_menu canonical popularity metric preserved", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "hi", status: "closed", completedOrderCount30d: 90, discoveryEligibilityRank: 0 }),
      item({ id: "lo", status: "closed", completedOrderCount30d: 10, discoveryEligibilityRank: 0 }),
      item({ id: "zero", status: "closed", completedOrderCount30d: 0 }),
    ]);
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["hi", "lo"]);
  });

  it("T9 new_store canonical signal/order", () => {
    const nowMs = Date.parse("2026-08-24T00:00:00.000Z");
    const newer = "2026-08-20T00:00:00.000Z";
    const older = "2026-08-10T00:00:00.000Z";
    expect(isNewStoreSignal({ firstListedAt: newer, nowMs })).toBe(true);
    const composition = composeStoresHomeFeed(
      [
        item({ id: "old", status: "closed", firstListedAt: older }),
        item({ id: "new", status: "closed", firstListedAt: newer }),
      ],
      { nowMs }
    );
    expect(composition.newStoreFood.map((e) => e.storeId)).toEqual(["new", "old"]);
  });

  it("T10 editorial_promo campaign membership", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "camp",
        status: "closed",
        rating: 3,
        reviewCount: 0,
        discoveryCampaign: {
          id: "c1",
          campaignType: "promo",
          title: "프로모",
          bodyCopy: null,
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-09-01T00:00:00.000Z",
        },
      }),
      item({ id: "plain", status: "closed", rating: 3, reviewCount: 0 }),
    ]);
    expect(composition.campaignFood.map((e) => e.storeId)).toEqual(["camp"]);
  });

  it("T11 delivery_fee_benefit requires fee evidence", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "strike", status: "closed", deliveryFeeStrikePhp: 40 }),
      item({ id: "zero", status: "closed", deliveryFeeStrikePhp: 0 }),
      item({ id: "none", status: "closed", deliveryFeeStrikePhp: null }),
    ]);
    expect(composition.slot3Food.map((e) => e.storeId)).toEqual(["strike"]);
  });

  it("T12 high_rating threshold/confidence", () => {
    expect(STORES_HOME_TOP_RATED_MIN_RATING).toBe(4);
    expect(STORES_HOME_TOP_RATED_MIN_REVIEWS).toBe(3);
    const composition = composeStoresHomeFeed([
      item({ id: "ok", status: "closed", rating: 4.2, reviewCount: 3 }),
      item({ id: "low-r", status: "closed", rating: 3.9, reviewCount: 99 }),
      item({ id: "low-n", status: "closed", rating: 5, reviewCount: 2 }),
    ]);
    expect(composition.slot4Food.map((e) => e.storeId)).toEqual(["ok"]);
  });

  it("T13 rest_stores discoverability — former main_stores stores reachable", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "open", status: "open", deliveryAvailable: true }),
      item({ id: "closed-a", status: "closed", rating: 3, reviewCount: 0 }),
      item({ id: "closed-b", status: "closed", rating: 3, reviewCount: 0 }),
      item({ id: "rated", status: "closed", rating: 4.8, reviewCount: 20 }),
    ]);
    expect(composition.slot1Stores).toEqual([]);
    expect(composition.slot6RestStores.map((s) => s.id)).toEqual(["closed-a", "closed-b"]);
    expect(composition.slot4Food.map((e) => e.storeId)).toContain("rated");
    const slot0 = new Set(composition.slot0Food.map((e) => e.storeId));
    expect(composition.slot6RestStores.every((s) => !slot0.has(s.id))).toBe(true);
  });

  it("T14 candidate 0 → section hidden (no fake fill)", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "only", status: "open", deliveryAvailable: true, completedOrderCount30d: 0 }),
    ]);
    expect(composition.slot2Food).toEqual([]);
    expect(composition.slot3Food).toEqual([]);
    expect(composition.slot5Food).toEqual([]);
    const shelves = resolveHomeShelfProductCatalog([]);
    const ordered = resolveOrderedVisibleHomeCompositionSlots(
      resolveDefaultCompositionPolicy("home"),
      composition,
      shelves
    );
    expect(ordered.includes("slot2Food")).toBe(false);
    expect(ordered.includes("slot3Food")).toBe(false);
  });

  it("T15–T16 paid-ad / coupon policy slots unchanged (disabled insertion rails)", () => {
    const policy = resolveDefaultCompositionPolicy("home");
    const paid = policy.find((r) => r.slot === "homePaidAdInsertion");
    const coupon = policy.find((r) => r.slot === "homeCouponInsertion");
    expect(paid?.enabled).toBe(false);
    expect(coupon?.enabled).toBe(false);
    expect(paid?.contentType).toBe("ad");
    expect(coupon?.contentType).toBe("coupon");
  });
});
