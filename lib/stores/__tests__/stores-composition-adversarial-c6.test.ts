/**
 * C6 — Adversarial contract tests for composition policy + engine + shadow.
 * No live cutover; fixture-only (no fake DB stores).
 */

import { describe, expect, it } from "vitest";
import { getCanonicalCompositionRows } from "@/lib/stores/composition/stores-composition-canonical-registry";
import {
  dedupePreserveDiscoveryOrder,
  preservesDiscoveryInputOrder,
} from "@/lib/stores/composition/stores-composition-invariants";
import {
  applyPolicyToBrowseComposition,
  applyPolicyToHomeComposition,
} from "@/lib/stores/composition/stores-composition-engine";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import {
  resolveCompositionPolicyRuntime,
  resolveDefaultCompositionPolicy,
} from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  detectForbiddenCompositionWriteFields,
  validateCompositionPolicyBatch,
  validateCompositionPolicyWriteRow,
} from "@/lib/stores/composition/stores-composition-policy-validation";
import {
  compareBrowseCompositionShadow,
  runHomeCompositionShadow,
} from "@/lib/stores/composition/stores-composition-shadow";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const NOT_CONSUMED = { consumed: false as const, reason: "NOT_CONSUMED" as const };

function homeRow(slot: string, patch: Record<string, unknown> = {}) {
  const canonical = getCanonicalCompositionRows("home").find((r) => r.slot === slot)!;
  return {
    surface: "home" as const,
    slot,
    contentType: canonical.contentType,
    enabled: canonical.enabled,
    order: canonical.order,
    max: canonical.max,
    interval: NOT_CONSUMED,
    ...patch,
  };
}

function feedItem(id: string, partial: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id,
    slug: id,
    nameKo: id,
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
    etaLabel: "25분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: 1,
    featuredItems: [{ productId: `p-${id}`, name: "메뉴", price: 500 }],
    platformPopularProducts: [{ productId: `pop-${id}`, name: "인기", price: 600, imageUrl: null, totalQty: 10, popularRank: 1, windowDays: 30 }],
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
    completedOrderCount30d: 10,
    discoveryEligibilityRank: 0,
    firstListedAt: null,
    ...partial,
  };
}

describe("C6-A INVALID POLICY — server validation rejects", () => {
  it("invalid surface", () => {
    expect(validateCompositionPolicyWriteRow({ ...homeRow("slot0Food"), surface: "invalid" })?.code).toBe(
      "invalid_surface"
    );
  });

  it("invalid slot", () => {
    expect(
      validateCompositionPolicyWriteRow({
        surface: "home",
        slot: "not_a_slot",
        enabled: true,
        order: 0,
        max: 16,
        interval: NOT_CONSUMED,
      })?.code
    ).toBe("invalid_slot");
  });

  it("wrong contentType", () => {
    expect(validateCompositionPolicyWriteRow({ ...homeRow("slot0Food"), contentType: "store" })?.code).toBe(
      "content_type_mismatch"
    );
  });

  it("invalid max", () => {
    expect(validateCompositionPolicyWriteRow({ ...homeRow("slot0Food"), max: -1 })?.code).toBe("invalid_max");
  });

  it("invalid order", () => {
    expect(validateCompositionPolicyWriteRow({ ...homeRow("slot0Food"), order: -1 })?.code).toBe("invalid_order");
  });

  it("consumed interval", () => {
    expect(
      validateCompositionPolicyWriteRow({
        ...homeRow("slot0Food"),
        interval: { consumed: true, everyN: 3 },
      })?.code
    ).toBe("interval_not_consumed_only");
  });

  it("forbidden ranking field in body", () => {
    expect(detectForbiddenCompositionWriteFields({ ranking_score: 1 })).toBe("ranking_score");
  });
});

describe("C6-H/I ORDER COLLISION + PARTIAL BATCH", () => {
  it("duplicate order → duplicate_order", () => {
    const rows = getCanonicalCompositionRows("home").map((r) => homeRow(r.slot));
    rows[2] = { ...rows[2]!, order: rows[0]!.order };
    expect(validateCompositionPolicyBatch("home", rows)?.code).toBe("duplicate_order");
  });

  it("partial batch → incomplete_surface_rows", () => {
    const rows = getCanonicalCompositionRows("home").slice(0, 3).map((r) => homeRow(r.slot));
    expect(validateCompositionPolicyBatch("home", rows)?.code).toBe("incomplete_surface_rows");
  });
});

describe("C6-B DISABLED SLOT — shadow only", () => {
  const stores = Array.from({ length: 12 }, (_, i) =>
    feedItem(`s${i}`, { completedOrderCount30d: 20 - i, deliveryFeeStrikePhp: 10 })
  );

  it("live composition unchanged; shadow slot empty", () => {
    const live = composeStoresHomeFeed(stores);
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot2Food" ? { ...r, enabled: false } : r
    );
    const shadow = applyPolicyToHomeComposition(live, policy);
    expect(live.slot2Food.length).toBeGreaterThan(0);
    expect(shadow.slot2Food).toEqual([]);
    expect(live.slot0Food.length).toBe(shadow.slot0Food.length);
  });
});

describe("C6-C CAP — order preserved", () => {
  it("max=2 on 4-item stream → [S1,S2] not [S2,S1]", () => {
    const input = ["S1", "S2", "S3", "S4"];
    const capped = input.slice(0, 2);
    expect(capped).toEqual(["S1", "S2"]);
    expect(preservesDiscoveryInputOrder(input, capped, (x) => x)).toBe(true);
  });

  it("engine cap on slot1Stores preserves survivor order", () => {
    const stores = Array.from({ length: 8 }, (_, i) => feedItem(`s${i}`));
    const live = composeStoresHomeFeed(stores);
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot1Stores" ? { ...r, max: 2 } : r
    );
    const shadow = applyPolicyToHomeComposition(live, policy);
    expect(shadow.slot1Stores.map((s) => s.id)).toEqual(live.slot1Stores.slice(0, 2).map((s) => s.id));
  });
});

describe("C6-D DEDUPE — fixture", () => {
  it("[S1,S2,S1,S3] → [S1,S2,S3] order preserved", () => {
    const input = ["S1", "S2", "S1", "S3"];
    const out = dedupePreserveDiscoveryOrder(input, (x) => x);
    expect(out).toEqual(["S1", "S2", "S3"]);
    expect(preservesDiscoveryInputOrder(input, out, (x) => x)).toBe(true);
  });
});

describe("C6-E EMPTY SLOT — no crash", () => {
  it("empty source slot stays deterministic", () => {
    const stores = [feedItem("solo", { completedOrderCount30d: 0, firstListedAt: null })];
    const live = composeStoresHomeFeed(stores);
    expect(live.newStoreFood).toEqual([]);
    const shadow = applyPolicyToHomeComposition(live, resolveDefaultCompositionPolicy("home"));
    expect(shadow.newStoreFood).toEqual([]);
    expect(shadow.slot0Food.length).toBeGreaterThan(0);
  });
});

describe("C6-F MISSING OVERRIDE — default parity", () => {
  it("no overrides → default parity with production", () => {
    const stores = Array.from({ length: 10 }, (_, i) => feedItem(`s${i}`, { completedOrderCount30d: 5 }));
    const report = runHomeCompositionShadow(stores, resolveDefaultCompositionPolicy("home"));
    expect(report.defaultParity).toBe(true);
  });
});

describe("C6-G INVALID PERSISTED ROW — resolver reject", () => {
  it("invalid max override rejected; canonical default fallback", () => {
    const bundle = resolveCompositionPolicyRuntime("home", [
      {
        surface: "home",
        slot: "slot0Food",
        enabled: true,
        order: 0,
        max: -5,
        interval: NOT_CONSUMED,
        hasOverride: true,
      },
    ]);
    expect(bundle.rejectedOverrideSlots).toContain("slot0Food");
    expect(bundle.rows.find((r) => r.slot === "slot0Food")?.max).toBe(16);
  });
});

describe("C6 BROWSE ADVERSARIAL — future slots non-live", () => {
  it("future slot enabled in policy still has 0 live injection", () => {
    const organic = ["a", "b", "c"];
    const policy = STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
      r.slot === "future_ad_insertion" ? { ...r, enabled: true, max: 5 } : r
    );
    const shadow = compareBrowseCompositionShadow(organic, policy);
    expect(shadow.futureInsertionsLive).toBe(false);
    expect(shadow.organicSameOrder).toBe(true);
    const engine = applyPolicyToBrowseComposition(organic, policy);
    const future = engine.slots.filter((s) => s.slot !== "organic_discovery_list");
    expect(future.every((s) => s.itemIds.length === 0 && !s.liveInjected)).toBe(true);
  });
});

describe("C6 CONCURRENCY — authority check", () => {
  it("no version/optimistic concurrency field in policy contract", () => {
    const row = resolveDefaultCompositionPolicy("home")[0]!;
    expect(Object.keys(row)).not.toContain("version");
    expect(Object.keys(row)).not.toContain("etag");
  });
});
