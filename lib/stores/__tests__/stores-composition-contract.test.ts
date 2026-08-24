import { describe, expect, it } from "vitest";
import {
  STORES_COMPOSITION_DISCOVERY_ORDER_INVARIANT_ID,
  STORES_COMPOSITION_FORBIDDEN_AUTHORITIES,
  type StoresCompositionSectionContract,
} from "@/lib/stores/composition/stores-composition-contract";
import {
  applyCapPreserveDiscoveryOrder,
  dedupePreserveDiscoveryOrder,
  filterEnabledCompositionSections,
  preservesDiscoveryInputOrder,
  sortSectionsByPresentationOrder,
} from "@/lib/stores/composition/stores-composition-invariants";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import {
  STORES_HOME_CAMPAIGN_SHELF_MAX,
  STORES_HOME_NEARBY_MAX,
  STORES_HOME_NEW_STORE_SHELF_MAX,
  STORES_HOME_POPULAR_SHELF_MAX,
  STORES_HOME_SLOT0_FOOD_MAX,
  STORES_HOME_SLOT5_FOOD_MAX,
  STORES_HOME_TOP_RATED_SHELF_MAX,
} from "@/lib/stores/stores-home-composer";

describe("stores-composition-invariants — discovery order", () => {
  const keyOf = (id: string) => id;

  it("cap preserves relative order", () => {
    const input = ["S1", "S2", "S3", "S4", "S5"];
    const capped = applyCapPreserveDiscoveryOrder(input, 3);
    expect(capped).toEqual(["S1", "S2", "S3"]);
    expect(preservesDiscoveryInputOrder(input, capped, keyOf)).toBe(true);
  });

  it("dedupe preserves relative order of survivors", () => {
    const input = ["S1", "S2", "S1", "S3"];
    const deduped = dedupePreserveDiscoveryOrder(input, keyOf);
    expect(deduped).toEqual(["S1", "S2", "S3"]);
    expect(preservesDiscoveryInputOrder(input, deduped, keyOf)).toBe(true);
  });

  it("reordered output fails invariant", () => {
    const input = ["S1", "S2", "S3"];
    expect(preservesDiscoveryInputOrder(input, ["S3", "S1", "S2"], keyOf)).toBe(false);
  });

  it("exports stable invariant id", () => {
    expect(STORES_COMPOSITION_DISCOVERY_ORDER_INVARIANT_ID).toBe(
      "composition_preserves_discovery_input_order_per_stream"
    );
  });
});

describe("stores-composition-invariants — section policy", () => {
  it("disabled sections are filtered without affecting enabled order", () => {
    const sections = [
      { enabled: true, order: 2 },
      { enabled: false, order: 1 },
      { enabled: true, order: 0 },
    ] as const;
    const enabled = filterEnabledCompositionSections(
      [...sections] as unknown as StoresCompositionSectionContract[]
    );
    expect(enabled.map((s) => s.order)).toEqual([2, 0]);
    const sorted = sortSectionsByPresentationOrder(enabled);
    expect(sorted.map((s) => s.order)).toEqual([0, 2]);
  });

  it("presentation section order is independent from discovery ranking indices", () => {
    const home = sortSectionsByPresentationOrder([...STORES_HOME_COMPOSITION_DEFAULT_POLICY]);
    const orders = home.map((s) => s.order);
    // 0–9 composer shelves + Stores A home insertion slots (10, 11; default disabled)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(orders).size).toBe(orders.length);
    expect(home.find((s) => s.slot === "homePaidAdInsertion")?.enabled).toBe(false);
    expect(home.find((s) => s.slot === "homeCouponInsertion")?.enabled).toBe(false);
  });
});

describe("STORES_HOME_COMPOSITION_DEFAULT_POLICY — production parity (declarative)", () => {
  const bySlot = Object.fromEntries(
    STORES_HOME_COMPOSITION_DEFAULT_POLICY.map((row) => [row.slot, row])
  ) as Record<string, (typeof STORES_HOME_COMPOSITION_DEFAULT_POLICY)[number]>;

  it("all HOME slots enabled with current composer caps", () => {
    expect(bySlot.slot0Food?.max).toBe(STORES_HOME_SLOT0_FOOD_MAX);
    expect(bySlot.slot1Stores?.max).toBeNull();
    expect(bySlot.slot2Food?.max).toBe(STORES_HOME_POPULAR_SHELF_MAX);
    expect(bySlot.newStoreFood?.max).toBe(STORES_HOME_NEW_STORE_SHELF_MAX);
    expect(bySlot.campaignFood?.max).toBe(STORES_HOME_CAMPAIGN_SHELF_MAX);
    expect(bySlot.slot3Food?.max).toBe(STORES_HOME_POPULAR_SHELF_MAX);
    expect(bySlot.slot4Food?.max).toBe(STORES_HOME_TOP_RATED_SHELF_MAX);
    expect(bySlot.slot5Food?.max).toBe(STORES_HOME_SLOT5_FOOD_MAX);
    expect(bySlot.slot6NearbyStores?.max).toBe(STORES_HOME_NEARBY_MAX);
    expect(bySlot.slot6RestStores?.max).toBeNull();
  });

  it("interval fields are NOT_CONSUMED in C1", () => {
    for (const row of STORES_HOME_COMPOSITION_DEFAULT_POLICY) {
      expect(row.interval.consumed).toBe(false);
      if (!row.interval.consumed) {
        expect(row.interval.reason).toBe("NOT_CONSUMED");
      }
    }
  });

  it("forbidden authorities list is frozen", () => {
    expect(STORES_COMPOSITION_FORBIDDEN_AUTHORITIES).toContain("ranking_score");
    expect(STORES_COMPOSITION_FORBIDDEN_AUTHORITIES).toContain("sort_authority");
    expect(STORES_COMPOSITION_FORBIDDEN_AUTHORITIES).toContain("campaign_eligibility_authority");
  });
});

describe("STORES_BROWSE_COMPOSITION_DEFAULT_POLICY — organic boundary", () => {
  it("organic list enabled; insertion slots disabled NOT_CONSUMED", () => {
    const organic = STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.find(
      (s) => s.slot === "organic_discovery_list"
    );
    expect(organic?.enabled).toBe(true);
    expect(organic?.max).toBeNull();

    const future = STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.filter((s) => s.slot !== "organic_discovery_list");
    expect(future.every((s) => s.enabled === false)).toBe(true);
    expect(future.every((s) => !s.interval.consumed && s.interval.reason === "NOT_CONSUMED")).toBe(
      true
    );
  });
});
