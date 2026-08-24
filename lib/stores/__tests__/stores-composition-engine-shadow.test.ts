import { describe, expect, it } from "vitest";
import {
  applyPolicyToBrowseComposition,
  applyPolicyToHomeComposition,
  assertHomeSlotPreservesDiscoveryOrder,
} from "@/lib/stores/composition/stores-composition-engine";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import {
  resolveCompositionPolicyRuntime,
  resolveDefaultCompositionPolicy,
} from "@/lib/stores/composition/stores-composition-policy-runtime";
import { resolveCompositionPolicyForSurface } from "@/lib/stores/composition/stores-composition-policy-resolve";
import {
  compareBrowseCompositionShadow,
  compareHomeCompositionShadow,
  runHomeCompositionShadow,
} from "@/lib/stores/composition/stores-composition-shadow";
import {
  composeStoresHomeFeed,
  STORES_HOME_SLOT0_FOOD_MAX,
} from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

function feedItem(id: string, partial: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id,
    slug: id,
    nameKo: `매장-${id}`,
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: "open",
    rating: 4.5,
    reviewCount: 10,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 15,
    etaLabel: "약 25~35분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: 1.2,
    featuredItems: [{ productId: `p-${id}`, name: "치킨", price: 500 }],
    platformPopularProducts: undefined,
    profileImageUrl: null,
    isFeatured: false,
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
    completedOrderCount30d: 5,
    discoveryEligibilityRank: 0,
    firstListedAt: null,
    ...partial,
  };
}

describe("C3 — policy resolution", () => {
  it("default policy matches canonical registry", () => {
    const home = resolveDefaultCompositionPolicy("home");
    expect(home.length).toBe(STORES_HOME_COMPOSITION_DEFAULT_POLICY.length);
    expect(home.find((r) => r.slot === "slot0Food")?.max).toBe(STORES_HOME_SLOT0_FOOD_MAX);
  });

  it("missing override → default", () => {
    const rows = resolveCompositionPolicyForSurface("home", []);
    expect(rows.find((r) => r.slot === "slot0Food")?.max).toBe(STORES_HOME_SLOT0_FOOD_MAX);
  });

  it("invalid persisted row rejected at runtime", () => {
    const bundle = resolveCompositionPolicyRuntime("home", [
      {
        surface: "home",
        slot: "slot0Food",
        enabled: true,
        order: 0,
        max: -1,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
        hasOverride: true,
      },
    ]);
    expect(bundle.rejectedOverrideSlots).toContain("slot0Food");
    expect(bundle.rows.find((r) => r.slot === "slot0Food")?.max).toBe(STORES_HOME_SLOT0_FOOD_MAX);
  });

  it("valid override merges into resolved policy", () => {
    const bundle = resolveCompositionPolicyRuntime("home", [
      {
        surface: "home",
        slot: "slot0Food",
        enabled: true,
        order: 0,
        max: 10,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
        hasOverride: true,
      },
    ]);
    expect(bundle.rows.find((r) => r.slot === "slot0Food")?.max).toBe(10);
  });
});

describe("C4 — composition engine", () => {
  const stores = Array.from({ length: 20 }, (_, i) => feedItem(`s${i}`));

  it("disabled slot returns empty", () => {
    const current = composeStoresHomeFeed(stores);
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot2Food" ? { ...r, enabled: false } : r
    );
    const shadow = applyPolicyToHomeComposition(current, policy);
    expect(shadow.slot2Food).toEqual([]);
    expect(current.slot2Food.length).toBeGreaterThan(0);
  });

  it("max cap preserves discovery order", () => {
    const current = composeStoresHomeFeed(stores);
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot0Food" ? { ...r, max: 2 } : r
    );
    const shadow = applyPolicyToHomeComposition(current, policy);
    expect(shadow.slot0Food.length).toBe(2);
    expect(assertHomeSlotPreservesDiscoveryOrder("slot0Food", current.slot0Food, shadow.slot0Food)).toBe(
      true
    );
  });

  it("never reorders survivors (S1,S2 not S2,S1)", () => {
    const current = composeStoresHomeFeed(stores);
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot6RestStores" ? { ...r, max: 2 } : r
    );
    const shadow = applyPolicyToHomeComposition(current, policy);
    const currentIds = current.slot6RestStores.slice(0, 2).map((s) => s.id);
    const shadowIds = shadow.slot6RestStores.map((s) => s.id);
    expect(shadowIds).toEqual(currentIds);
  });

  it("browse future insertion slots stay non-live", () => {
    const organic = ["a", "b", "c", "d"];
    const result = applyPolicyToBrowseComposition(organic, STORES_BROWSE_COMPOSITION_DEFAULT_POLICY);
    expect(result.organicIds).toEqual(organic);
    const future = result.slots.filter((s) => s.slot !== "organic_discovery_list");
    expect(future.every((s) => s.itemIds.length === 0 && s.liveInjected === false)).toBe(true);
  });
});

describe("C5 — shadow mode", () => {
  const stores = Array.from({ length: 24 }, (_, i) =>
    feedItem(`s${i}`, {
      status: "open",
      deliveryAvailable: true,
      completedOrderCount30d: 50 - i,
      deliveryFeeStrikePhp: i % 2 === 0 ? 20 : null,
      rating: 4.6,
      reviewCount: 5,
    })
  );

  it("default policy shadow matches current production", () => {
    const report = runHomeCompositionShadow(stores, resolveDefaultCompositionPolicy("home"));
    expect(report.defaultParity).toBe(true);
    expect(report.diffCount).toBe(0);
  });

  it("admin override produces shadow delta only on overridden slot", () => {
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot0Food" ? { ...r, max: 5 } : r
    );
    const report = runHomeCompositionShadow(stores, policy, {
      overrideSlots: new Set(["slot0Food"]),
    });
    expect(report.defaultParity).toBe(false);
    expect(report.overrideDeltaOnly).toBe(true);
    const slot0 = report.slots.find((s) => s.slot === "slot0Food");
    expect(slot0?.sameOrder).toBe(false);
    expect(slot0?.shadowIds.length).toBe(5);
    expect(slot0?.reasonForDifference).toContain("admin_override_max");
    const others = report.slots.filter((s) => s.slot !== "slot0Food");
    expect(others.every((s) => s.sameOrder)).toBe(true);
  });

  it("browse organic preservation with default policy", () => {
    const organic = ["id1", "id2", "id3"];
    const browse = compareBrowseCompositionShadow(organic, STORES_BROWSE_COMPOSITION_DEFAULT_POLICY);
    expect(browse.defaultParity).toBe(true);
    expect(browse.futureInsertionsLive).toBe(false);
    expect(browse.organicSameOrder).toBe(true);
  });

  it("compareHomeCompositionShadow records per-slot diff", () => {
    const current = composeStoresHomeFeed(stores);
    const policy = resolveDefaultCompositionPolicy("home");
    const shadow = applyPolicyToHomeComposition(current, policy);
    const report = compareHomeCompositionShadow(current, shadow, policy);
    expect(report.slots.length).toBe(10);
    expect(report.slots.every((s) => s.sameOrder)).toBe(true);
  });
});
