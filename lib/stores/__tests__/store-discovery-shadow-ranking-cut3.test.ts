import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { districtRank } from "@/lib/geo/haversine-km";
import { evaluateDeliveryServiceability } from "@/lib/delivery/evaluate-delivery-serviceability";
import {
  DEFAULT_DELIVERY_DISTANCE_POLICY,
  DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
} from "@/lib/delivery/delivery-ops-settings";
import { resolveStoreDiscoveryEligibility } from "@/lib/stores/store-discovery-eligibility";
import {
  sortStoreDiscoveryBrowseRows,
  sortStoreDiscoveryHomeFeedRows,
  type StoreBrowseServerSortId,
} from "@/lib/stores/store-discovery-browse-sort";
import {
  applyStoreDiscoveryExposureRotation,
  buildStoreDiscoveryBrowseExposureScope,
  buildStoreDiscoveryHomeExposureScope,
} from "@/lib/stores/store-discovery-exposure";
import { STORE_AUTO_SCHEDULE_ENFORCED_KEY } from "@/lib/stores/serialize-store-business-hours-json";
import { shadowDistrictTier, shadowDistrictTierFromNorm } from "@/lib/stores/discovery/shadow-district-tier";
import { resolveShadowCoverageMembership } from "@/lib/stores/discovery/shadow-coverage-membership";
import { resolveShadowEligibilityFromProjection } from "@/lib/stores/discovery/shadow-eligibility";
import {
  rankStoreDiscoveryBrowseShadow,
  rankStoreDiscoveryHomeShadow,
  type StoreDiscoveryShadowCandidate,
} from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import {
  assertShadowParityExact,
  compareStoreDiscoveryShadowParity,
} from "@/lib/stores/discovery/store-discovery-shadow-parity";
import { haversineKm } from "@/lib/geo/haversine-km";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260823170000_stores_discovery_shadow_ranking_cut3.sql"
);

const ORIGIN = { lat: 14.5995, lng: 120.9842 };
const NOW_MS = Date.parse("2026-08-23T10:00:00.000Z");

function autoHoursOpenAllDay() {
  return {
    auto_business_hours: {
      enabled: true,
      timezone: "Asia/Manila",
      open: "00:00",
      close: "23:59",
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
    },
  };
}

function autoHoursClosed() {
  return {
    auto_business_hours: {
      enabled: true,
      timezone: "Asia/Manila",
      open: "09:00",
      close: "10:00",
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
    },
  };
}

type FixtureStore = {
  id: string;
  slug: string;
  district: string | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean;
  is_open: boolean;
  point_commerce_blocked?: boolean;
  schedule: "ORDERABLE" | "IN_BREAK" | "CLOSED" | "PREPARING";
  hours: unknown;
  completed_orders_30d: number;
  lat: number | null;
  lng: number | null;
  maxKm?: number | null;
  coversAll?: boolean;
  distanceApplies?: boolean;
};

function offsetPoint(kmEast: number): { lat: number; lng: number } {
  const lng = ORIGIN.lng + kmEast / (111.32 * Math.cos((ORIGIN.lat * Math.PI) / 180));
  return { lat: ORIGIN.lat, lng };
}

function toShadowCandidate(s: FixtureStore, distanceAxisEnabled: boolean): StoreDiscoveryShadowCandidate {
  const effectiveMax = s.maxKm ?? 5;
  let originCovered: boolean | null = null;
  let hasCoverageGeog = false;
  const distanceApplies = s.distanceApplies ?? distanceAxisEnabled;
  const coversAll = s.coversAll === true || (distanceApplies && (s.maxKm === null || s.maxKm === undefined && s.coversAll));

  if (distanceApplies && !coversAll && s.lat != null && s.lng != null) {
    hasCoverageGeog = true;
    const d = haversineKm(ORIGIN.lat, ORIGIN.lng, s.lat, s.lng);
    const rounded = d == null ? null : Math.round(d * 1000) / 1000;
    originCovered = rounded != null && (effectiveMax == null || rounded <= effectiveMax);
  } else if (distanceApplies && coversAll) {
    originCovered = true;
  } else if (distanceApplies && (s.lat == null || s.lng == null)) {
    hasCoverageGeog = false;
    originCovered = false;
  }

  return {
    id: s.id,
    slug: s.slug,
    district: s.district,
    rating_avg: s.rating_avg,
    review_count: s.review_count,
    delivery_available: s.delivery_available,
    discovery_schedule_state: s.schedule,
    completed_orders_30d: s.completed_orders_30d,
    lat: s.lat,
    lng: s.lng,
    coverage: {
      distanceApplies,
      coversAll: coversAll === true || (distanceApplies && s.maxKm == null && s.coversAll !== false && s.lat != null),
      hasCoverageGeog,
      originCovered,
    },
  };
}

function fixCoverage(c: StoreDiscoveryShadowCandidate, s: FixtureStore, distanceAxisEnabled: boolean): StoreDiscoveryShadowCandidate {
  if (!distanceAxisEnabled) {
    return {
      ...c,
      coverage: { distanceApplies: false, coversAll: false, hasCoverageGeog: false, originCovered: false },
    };
  }
  if (s.coversAll) {
    return {
      ...c,
      coverage: { distanceApplies: true, coversAll: true, hasCoverageGeog: false, originCovered: true },
    };
  }
  if (s.distanceApplies === false) {
    return {
      ...c,
      coverage: { distanceApplies: false, coversAll: false, hasCoverageGeog: false, originCovered: false },
    };
  }
  if (s.maxKm == null && s.coversAll !== false) {
    return {
      ...c,
      coverage: { distanceApplies: true, coversAll: true, hasCoverageGeog: false, originCovered: true },
    };
  }
  if (s.lat == null || s.lng == null) {
    return {
      ...c,
      coverage: { distanceApplies: true, coversAll: false, hasCoverageGeog: false, originCovered: false },
    };
  }
  const maxKm = s.maxKm ?? 5;
  const d = haversineKm(ORIGIN.lat, ORIGIN.lng, s.lat, s.lng);
  const rounded = d == null ? null : Math.round(d * 1000) / 1000;
  return {
    ...c,
    coverage: {
      distanceApplies: true,
      coversAll: false,
      hasCoverageGeog: true,
      originCovered: rounded != null && rounded <= maxKm,
    },
  };
}

function buildFixtureOverrides(stores: FixtureStore[]) {
  const overrides = { stores: { ...DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES.stores } };
  for (const s of stores) {
    if (s.maxKm !== undefined || s.distanceApplies === false || s.coversAll) {
      overrides.stores[s.id] = {
        mode: s.distanceApplies === false ? "disabled" : "enabled",
        maxKm: s.coversAll || s.maxKm === null ? null : (s.maxKm ?? 5),
      };
    }
  }
  return overrides;
}

function oldHomeRank(stores: FixtureStore[], opts: { district: string | null; distanceAxisEnabled: boolean; searchQ?: string | null }) {
  const policy = {
    ...DEFAULT_DELIVERY_DISTANCE_POLICY,
    enabled: opts.distanceAxisEnabled,
    defaultMaxKm: 5,
  };
  const overrides = buildFixtureOverrides(stores);
  let list = stores;
  const q = opts.searchQ?.trim() ?? "";
  if (q.length >= 2) {
    const needle = q.toLowerCase();
    list = list.filter(
      (s) => s.slug.toLowerCase().includes(needle) || s.id.toLowerCase().includes(needle)
    );
  }

  const eligibilityRankById = new Map<string, number>();
  const distanceKmById = new Map<string, number | null>();
  const outOfRangeById = new Map<string, boolean>();
  const completedOrderCount30dById = new Map<string, number>();

  const rows = list.map((s) => {
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides,
      storeId: s.id,
      customerLat: ORIGIN.lat,
      customerLng: ORIGIN.lng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange = svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const el = resolveStoreDiscoveryEligibility({
      business_hours_json: s.hours,
      is_open: s.is_open,
      point_commerce_blocked: s.point_commerce_blocked ?? false,
      delivery_available: s.delivery_available,
      distanceOutOfRange: outOfRange,
      now: new Date(NOW_MS),
    });
    eligibilityRankById.set(s.id, el.rank);
    distanceKmById.set(s.id, svc.distanceKm);
    outOfRangeById.set(s.id, outOfRange);
    completedOrderCount30dById.set(s.id, s.completed_orders_30d);
    return {
      id: s.id,
      slug: s.slug,
      district: s.district,
      rating_avg: s.rating_avg,
      review_count: s.review_count,
    };
  });

  const sorted = sortStoreDiscoveryHomeFeedRows(rows, {
    district: opts.district,
    eligibilityRankById,
    distanceKmById: opts.distanceAxisEnabled ? distanceKmById : null,
    outOfRangeById: opts.distanceAxisEnabled ? outOfRangeById : null,
    hasGeo: opts.distanceAxisEnabled,
    completedOrderCount30dById,
    completedOrderCountStatus: "ok",
  });

  const exposed = applyStoreDiscoveryExposureRotation({
    recommendedSorted: sorted,
    eligibilityRankById,
    exposureScope: buildStoreDiscoveryHomeExposureScope({
      region: null,
      district: opts.district,
      searchQ: opts.searchQ ?? null,
      originKey: `${ORIGIN.lat},${ORIGIN.lng}`,
      hasGeo: opts.distanceAxisEnabled,
      geoKey: "g",
    }),
    nowMs: NOW_MS,
  });

  return exposed.slice(0, 48);
}

function newHomeRank(stores: FixtureStore[], opts: { district: string | null; distanceAxisEnabled: boolean }) {
  const candidates = stores.map((s) =>
    fixCoverage(toShadowCandidate(s, opts.distanceAxisEnabled), s, opts.distanceAxisEnabled)
  );
  return rankStoreDiscoveryHomeShadow({
    candidates,
    district: opts.district,
    originLat: ORIGIN.lat,
    originLng: ORIGIN.lng,
    distanceAxisEnabled: opts.distanceAxisEnabled,
    exposureScope: buildStoreDiscoveryHomeExposureScope({
      region: null,
      district: opts.district,
      searchQ: null,
      originKey: `${ORIGIN.lat},${ORIGIN.lng}`,
      hasGeo: opts.distanceAxisEnabled,
      geoKey: "g",
    }),
    nowMs: NOW_MS,
  }).rows;
}

function oldBrowseRank(
  stores: FixtureStore[],
  opts: {
    sort: StoreBrowseServerSortId;
    district: string | null;
    distanceAxisEnabled: boolean;
    page: number;
    limit: number;
  }
) {
  const policy = {
    ...DEFAULT_DELIVERY_DISTANCE_POLICY,
    enabled: opts.distanceAxisEnabled,
    defaultMaxKm: 5,
  };
  const overrides = buildFixtureOverrides(stores);
  const eligibilityRankById = new Map<string, number>();
  const distanceKmById = new Map<string, number | null>();
  const outOfRangeById = new Map<string, boolean>();
  const completedOrderCount30dById = new Map<string, number>();

  const rows = stores.map((s) => {
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides,
      storeId: s.id,
      customerLat: ORIGIN.lat,
      customerLng: ORIGIN.lng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange = svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const el = resolveStoreDiscoveryEligibility({
      business_hours_json: s.hours,
      is_open: s.is_open,
      point_commerce_blocked: s.point_commerce_blocked ?? false,
      delivery_available: s.delivery_available,
      distanceOutOfRange: outOfRange,
      now: new Date(NOW_MS),
    });
    eligibilityRankById.set(s.id, el.rank);
    distanceKmById.set(s.id, svc.distanceKm);
    outOfRangeById.set(s.id, outOfRange);
    completedOrderCount30dById.set(s.id, s.completed_orders_30d);
    return {
      id: s.id,
      slug: s.slug,
      district: s.district,
      rating_avg: s.rating_avg,
      review_count: s.review_count,
    };
  });

  const needsOrders = opts.sort === "default" || opts.sort === "popular";
  let sorted = sortStoreDiscoveryBrowseRows(rows, {
    district: opts.district,
    sort: opts.sort,
    eligibilityRankById,
    distanceKmById: opts.distanceAxisEnabled ? distanceKmById : null,
    outOfRangeById: opts.distanceAxisEnabled ? outOfRangeById : null,
    hasGeo: opts.distanceAxisEnabled,
    completedOrderCount30dById: needsOrders ? completedOrderCount30dById : null,
    completedOrderCountStatus: "ok",
  });

  if (opts.sort === "default") {
    sorted = applyStoreDiscoveryExposureRotation({
      recommendedSorted: sorted,
      eligibilityRankById,
      exposureScope: buildStoreDiscoveryBrowseExposureScope({
        primary: "food",
        sub: "all",
        regionQ: "",
        cityQ: "",
        district: opts.district,
        geoPart: "g",
      }),
      nowMs: NOW_MS,
    });
  }

  const pageStart = (opts.page - 1) * opts.limit;
  return sorted.slice(pageStart, pageStart + opts.limit);
}

function newBrowseRank(
  stores: FixtureStore[],
  opts: {
    sort: StoreBrowseServerSortId;
    district: string | null;
    distanceAxisEnabled: boolean;
    page: number;
    limit: number;
  }
) {
  const candidates = stores.map((s) =>
    fixCoverage(toShadowCandidate(s, opts.distanceAxisEnabled), s, opts.distanceAxisEnabled)
  );
  return rankStoreDiscoveryBrowseShadow({
    candidates,
    sort: opts.sort,
    district: opts.district,
    originLat: ORIGIN.lat,
    originLng: ORIGIN.lng,
    distanceAxisEnabled: opts.distanceAxisEnabled,
    page: opts.page,
    limit: opts.limit,
    exposureScope: buildStoreDiscoveryBrowseExposureScope({
      primary: "food",
      sub: "all",
      regionQ: "",
      cityQ: "",
      district: opts.district,
      geoPart: "g",
    }),
    nowMs: NOW_MS,
  }).rows;
}

function store(partial: Partial<FixtureStore> & { id: string; slug: string }): FixtureStore {
  const near = offsetPoint(0.5);
  return {
    district: "Makati",
    rating_avg: 4.5,
    review_count: 10,
    delivery_available: true,
    is_open: true,
    schedule: "ORDERABLE",
    hours: autoHoursOpenAllDay(),
    completed_orders_30d: 5,
    lat: near.lat,
    lng: near.lng,
    maxKm: 5,
    ...partial,
  };
}

describe("CUT 3 shadow ranking migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("defines service_role-only shadow RPCs using active coverage version", () => {
    expect(sql).toContain("get_store_discovery_home_shadow");
    expect(sql).toContain("get_store_discovery_browse_shadow");
    expect(sql).toContain("store_discovery_active_coverage_policy_version");
    expect(sql).toContain("building_policy_version");
    expect(sql).toMatch(/never read building_policy_version/i);
    expect(sql).toContain("ST_Covers");
    expect(sql).not.toMatch(/FROM\s+public\.store_orders/i);
    expect(sql).not.toMatch(/JOIN\s+public\.store_orders/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_store_discovery_home_shadow[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_store_discovery_home_shadow[\s\S]*TO service_role/);
  });

  it("locks projection tables from public/authenticated again", () => {
    expect(sql).toContain("REVOKE ALL ON TABLE public.store_delivery_coverage FROM PUBLIC, anon, authenticated");
  });
});

describe("district tier parity", () => {
  it("matches districtRank for D0/D1/D2", () => {
    expect(shadowDistrictTier("Makati", "makati")).toBe(districtRank("Makati", "makati"));
    expect(shadowDistrictTier("Makati Central", "makati")).toBe(districtRank("Makati Central", "makati"));
    expect(shadowDistrictTier("Quezon", "Makati")).toBe(districtRank("Quezon", "Makati"));
    expect(shadowDistrictTierFromNorm("makati", "Makati")).toBe(0);
  });
});

describe("coverage eligibility parity G0/G2", () => {
  const policy = { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 };

  it("inside / exact boundary / just outside match evaluator", () => {
    const storeLat = ORIGIN.lat;
    const storeLng = ORIGIN.lng;
    let boundaryLng = storeLng;
    let outsideLng = storeLng;
    for (let i = 0; i < 50_000; i += 1) {
      boundaryLng += 0.00001;
      const raw = haversineKm(storeLat, storeLng, storeLat, boundaryLng);
      if (raw == null) continue;
      const rounded = Math.round(raw * 1000) / 1000;
      if (rounded === 5) break;
    }
    for (let i = 0; i < 50_000; i += 1) {
      outsideLng += 0.00001;
      const raw = haversineKm(storeLat, storeLng, storeLat, outsideLng);
      if (raw == null) continue;
      const rounded = Math.round(raw * 1000) / 1000;
      if (rounded > 5) break;
    }

    for (const [customerLng, expectInside] of [
      [storeLng, true],
      [boundaryLng, true],
      [outsideLng, false],
    ] as const) {
      const evalResult = evaluateDeliveryServiceability({
        policy,
        overrides: DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
        storeId: "s1",
        customerLat: storeLat,
        customerLng,
        storeLat,
        storeLng,
      });
      const d = haversineKm(storeLat, storeLng, storeLat, customerLng);
      const rounded = d == null ? null : Math.round(d * 1000) / 1000;
      const membership = resolveShadowCoverageMembership(
        {
          distanceApplies: true,
          coversAll: false,
          hasCoverageGeog: true,
          originCovered: rounded != null && rounded <= 5,
        },
        { hasOrigin: true, distanceAxisEnabled: true }
      );
      expect(membership.outOfRange).toBe(!expectInside);
      expect(evalResult.eligible).toBe(expectInside);
      expect(membership.outOfRange).toBe(!evalResult.eligible);
    }
  });

  it("policy off / covers_all / missing coords", () => {
    expect(
      resolveShadowCoverageMembership(null, { hasOrigin: true, distanceAxisEnabled: false }).outOfRange
    ).toBe(false);
    expect(
      resolveShadowCoverageMembership(
        { distanceApplies: true, coversAll: true, hasCoverageGeog: false, originCovered: true },
        { hasOrigin: true, distanceAxisEnabled: true }
      ).outOfRange
    ).toBe(false);
    expect(
      resolveShadowCoverageMembership(
        { distanceApplies: true, coversAll: false, hasCoverageGeog: false, originCovered: false },
        { hasOrigin: true, distanceAxisEnabled: true }
      ).outOfRange
    ).toBe(true);
  });
});

describe("schedule projection eligibility mapping", () => {
  it("maps ORDERABLE/IN_BREAK/CLOSED/PREPARING to G0–G5", () => {
    expect(
      resolveShadowEligibilityFromProjection({
        discoveryScheduleState: "ORDERABLE",
        deliveryAvailable: true,
        outOfRange: false,
      }).rank
    ).toBe(0);
    expect(
      resolveShadowEligibilityFromProjection({
        discoveryScheduleState: "ORDERABLE",
        deliveryAvailable: false,
        outOfRange: false,
      }).rank
    ).toBe(1);
    expect(
      resolveShadowEligibilityFromProjection({
        discoveryScheduleState: "ORDERABLE",
        deliveryAvailable: true,
        outOfRange: true,
      }).rank
    ).toBe(2);
    expect(
      resolveShadowEligibilityFromProjection({
        discoveryScheduleState: "IN_BREAK",
        deliveryAvailable: true,
        outOfRange: false,
      }).rank
    ).toBe(3);
    expect(
      resolveShadowEligibilityFromProjection({
        discoveryScheduleState: "PREPARING",
        deliveryAvailable: true,
        outOfRange: false,
      }).rank
    ).toBe(4);
    expect(
      resolveShadowEligibilityFromProjection({
        discoveryScheduleState: "CLOSED",
        deliveryAvailable: true,
        outOfRange: false,
      }).rank
    ).toBe(5);
  });
});

describe("HOME top48 parity", () => {
  it("normal small pool — membership and order match", () => {
    const stores = [
      store({ id: "a", slug: "a", completed_orders_30d: 20, rating_avg: 4.9 }),
      store({ id: "b", slug: "b", completed_orders_30d: 10, rating_avg: 4.2 }),
      store({ id: "c", slug: "c", schedule: "CLOSED", hours: autoHoursClosed(), is_open: false, completed_orders_30d: 100 }),
      store({ id: "d", slug: "d", delivery_available: false, completed_orders_30d: 50 }),
      store({
        id: "e",
        slug: "e-new",
        completed_orders_30d: 0,
        rating_avg: null,
        review_count: 0,
      }),
    ];
    const oldRows = oldHomeRank(stores, { district: "Makati", distanceAxisEnabled: true });
    const newRows = newHomeRank(stores, { district: "Makati", distanceAxisEnabled: true });
    assertShadowParityExact(oldRows, newRows);
  });

  it("closed high popularity loses to open low popularity", () => {
    const stores = [
      store({
        id: "closed-hot",
        slug: "closed-hot",
        schedule: "CLOSED",
        hours: autoHoursClosed(),
        is_open: false,
        completed_orders_30d: 999,
      }),
      store({ id: "open-cold", slug: "open-cold", completed_orders_30d: 1 }),
    ];
    const newRows = newHomeRank(stores, { district: null, distanceAxisEnabled: false });
    expect(newRows[0]?.id).toBe("open-cold");
  });

  it("150 stores with high-order tail — top48 stable vs OLD", () => {
    const stores: FixtureStore[] = [];
    for (let i = 0; i < 150; i += 1) {
      const pt = offsetPoint(0.2 + (i % 20) * 0.1);
      stores.push(
        store({
          id: `s${String(i).padStart(3, "0")}`,
          slug: `s${String(i).padStart(3, "0")}`,
          completed_orders_30d: i === 149 ? 500 : i,
          rating_avg: 3 + (i % 20) / 10,
          review_count: i,
          lat: pt.lat,
          lng: pt.lng,
          district: i % 3 === 0 ? "Makati" : i % 3 === 1 ? "Makati Central" : "Quezon",
        })
      );
    }
    const oldRows = oldHomeRank(stores, { district: "Makati", distanceAxisEnabled: true });
    const newRows = newHomeRank(stores, { district: "Makati", distanceAxisEnabled: true });
    expect(oldRows).toHaveLength(48);
    expect(newRows).toHaveLength(48);
    assertShadowParityExact(oldRows, newRows);
  });
});

describe("BROWSE sort + pagination parity", () => {
  function buildBrowsePool(): FixtureStore[] {
    const stores: FixtureStore[] = [];
    for (let i = 0; i < 130; i += 1) {
      const pt = offsetPoint(0.3 + (i % 30) * 0.15);
      stores.push(
        store({
          id: `b${String(i).padStart(3, "0")}`,
          slug: `b${String(i).padStart(3, "0")}`,
          completed_orders_30d: (i * 7) % 40,
          rating_avg: i % 11 === 0 ? null : 3.5 + (i % 15) / 10,
          review_count: (i * 3) % 50,
          lat: pt.lat,
          lng: pt.lng,
          district: i % 2 === 0 ? "Makati" : "Pasig",
          schedule: i % 17 === 0 ? "CLOSED" : "ORDERABLE",
          hours: i % 17 === 0 ? autoHoursClosed() : autoHoursOpenAllDay(),
          is_open: i % 17 !== 0,
        })
      );
    }
    return stores;
  }

  const sorts: StoreBrowseServerSortId[] = ["default", "distance", "rating", "reviews", "popular"];

  for (const sort of sorts) {
    it(`sort=${sort} page1 and page2 parity`, () => {
      const stores = buildBrowsePool();
      for (const page of [1, 2, 3]) {
        const opts = {
          sort,
          district: "Makati" as string | null,
          distanceAxisEnabled: true,
          page,
          limit: 60,
        };
        const oldRows = oldBrowseRank(stores, opts);
        const newRows = newBrowseRank(stores, opts);
        const diff = compareStoreDiscoveryShadowParity(oldRows, newRows);
        expect(diff.firstDivergence).toBeNull();
        expect(diff.membershipDiff).toEqual([]);
        expect(diff.lengthMismatch).toBe(false);
      }
    });
  }

  it("page window is contiguous on global order (no page1-only cheat)", () => {
    const stores = buildBrowsePool();
    const page1 = newBrowseRank(stores, {
      sort: "popular",
      district: null,
      distanceAxisEnabled: false,
      page: 1,
      limit: 60,
    });
    const page2 = newBrowseRank(stores, {
      sort: "popular",
      district: null,
      distanceAxisEnabled: false,
      page: 2,
      limit: 60,
    });
    expect(page1).toHaveLength(60);
    expect(page2.length).toBeGreaterThan(0);
    const overlap = page1.filter((r) => page2.some((x) => x.id === r.id));
    expect(overlap).toHaveLength(0);
  });
});

describe("adversarial G2 near + G0 far parity", () => {
  it("1000 G2 near + 100 G0 far — HOME top prefers G0", () => {
    const stores: FixtureStore[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const pt = offsetPoint(0.2);
      stores.push(
        store({
          id: `g2-${i}`,
          slug: `g2-${i}`,
          lat: pt.lat,
          lng: pt.lng,
          maxKm: 0.05,
          completed_orders_30d: 100,
        })
      );
    }
    for (let i = 0; i < 100; i += 1) {
      const pt = offsetPoint(3);
      stores.push(
        store({
          id: `g0-${i}`,
          slug: `g0-${i}`,
          lat: pt.lat,
          lng: pt.lng,
          maxKm: 10,
          completed_orders_30d: 1,
        })
      );
    }
    const newRows = newHomeRank(stores, { district: null, distanceAxisEnabled: true });
    expect(newRows[0]?.id.startsWith("g0-")).toBe(true);
    const oldRows = oldHomeRank(stores, { district: null, distanceAxisEnabled: true });
    assertShadowParityExact(oldRows.slice(0, 20), newRows.slice(0, 20));
  });
});

describe("cardinality / no-live-aggregate guards", () => {
  it("shadow modules do not import store_orders loaders", async () => {
    const ranked = readFileSync(
      join(process.cwd(), "lib/stores/discovery/store-discovery-shadow-ranked.ts"),
      "utf8"
    );
    const adapter = readFileSync(
      join(process.cwd(), "lib/stores/discovery/store-discovery-shadow-adapter.ts"),
      "utf8"
    );
    expect(ranked).not.toMatch(/get_store_completed_order_counts/);
    expect(ranked).not.toMatch(/loadHomeDiscoveryCandidateRows/);
    expect(ranked).not.toMatch(/resolveStoreFrontCommerceState/);
    expect(ranked).not.toMatch(/loadStoreCompletedOrderCount/);
    expect(adapter).not.toMatch(/get_store_completed_order_counts/);
  });
});
