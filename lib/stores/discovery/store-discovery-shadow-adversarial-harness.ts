/**
 * CUT 6 — Adversarial parity harness (fixture-only, no Production inserts).
 * OLD full-candidate comparator = oracle. NEW = bounded Gi×Dj shadow waves.
 */
import { districtRank, haversineKm } from "@/lib/geo/haversine-km";
import {
  DEFAULT_DELIVERY_DISTANCE_POLICY,
  DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
  type DeliveryDistancePolicy,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import { evaluateDeliveryServiceability } from "@/lib/delivery/evaluate-delivery-serviceability";
import { buildStoreDeliveryCoverageProjection } from "@/lib/stores/discovery/build-store-delivery-coverage";
import {
  compareStoreDiscoveryShadowParity,
  type ShadowParityDiff,
} from "@/lib/stores/discovery/store-discovery-shadow-parity";
import {
  rankStoreDiscoveryBrowseShadow,
  rankStoreDiscoveryHomeShadow,
  type StoreDiscoveryShadowCandidate,
  type StoreDiscoveryShadowRankedRow,
  type ShadowWaveTelemetry,
} from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import { shadowDistrictTier } from "@/lib/stores/discovery/shadow-district-tier";
import { resolveShadowCoverageMembership } from "@/lib/stores/discovery/shadow-coverage-membership";
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
import { computeDiscoveryScheduleProjection } from "@/lib/stores/discovery/compute-discovery-schedule-projection";
import { STORE_AUTO_SCHEDULE_ENFORCED_KEY } from "@/lib/stores/serialize-store-business-hours-json";

export const CUT6_ORIGIN = { lat: 14.5995, lng: 120.9842 };
/** 14:30 Asia/Manila — enables IN_BREAK window fixtures */
export const CUT6_NOW_MS = Date.parse("2026-08-23T06:30:00.000Z");

export type AdversarialFixtureStore = {
  id: string;
  slug: string;
  district: string | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean;
  is_open: boolean;
  point_commerce_blocked?: boolean;
  schedule: "ORDERABLE" | "IN_BREAK" | "CLOSED" | "PREPARING" | "UNKNOWN" | null;
  hours: unknown;
  completed_orders_30d: number;
  lat: number | null;
  lng: number | null;
  /** undefined = inherit global; null = covers_all when enabled */
  maxKm?: number | null;
  overrideMode?: "inherit" | "enabled" | "disabled";
  /** When true, omit coverage projection on NEW (CASE X) */
  missingCoverage?: boolean;
  /** When set, force discovery_schedule_state on NEW without matching hours (stale/missing) */
  forceSchedule?: AdversarialFixtureStore["schedule"];
  store_category_id?: string | null;
  store_topic_id?: string | null;
  name?: string | null;
};

export type HarnessPolicyOpts = {
  policy?: DeliveryDistancePolicy;
  overrides?: DeliveryStoreDistanceOverrides;
  nowMs?: number;
  origin?: { lat: number; lng: number };
  defaultMaxKm?: number | null;
};

export function autoHoursOpenAllDay() {
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

export function autoHoursClosed() {
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

export function autoHoursInBreakAtCut6Now() {
  return {
    auto_business_hours: {
      enabled: true,
      timezone: "Asia/Manila",
      open: "00:00",
      close: "23:59",
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
    },
    break_hours: { start: "14:00", end: "15:00" },
  };
}

export function offsetPoint(kmEast: number, origin = CUT6_ORIGIN): { lat: number; lng: number } {
  const lng = origin.lng + kmEast / (111.32 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat: origin.lat, lng };
}

export function adversarialStore(
  partial: Partial<AdversarialFixtureStore> & { id: string; slug: string }
): AdversarialFixtureStore {
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

function resolvePolicyBundle(opts: HarnessPolicyOpts, stores: AdversarialFixtureStore[]) {
  const policy: DeliveryDistancePolicy = {
    ...DEFAULT_DELIVERY_DISTANCE_POLICY,
    ...(opts.policy ?? {}),
    defaultMaxKm:
      opts.defaultMaxKm !== undefined
        ? opts.defaultMaxKm
        : (opts.policy?.defaultMaxKm ?? DEFAULT_DELIVERY_DISTANCE_POLICY.defaultMaxKm),
  };
  const overrides: DeliveryStoreDistanceOverrides = {
    stores: {
      ...DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES.stores,
      ...(opts.overrides?.stores ?? {}),
    },
  };
  for (const s of stores) {
    if (s.overrideMode === "disabled") {
      overrides.stores[s.id] = { mode: "disabled", maxKm: s.maxKm ?? policy.defaultMaxKm };
    } else if (s.overrideMode === "enabled" || s.maxKm !== undefined) {
      overrides.stores[s.id] = {
        mode: "enabled",
        maxKm: s.maxKm === undefined ? policy.defaultMaxKm : s.maxKm,
      };
    }
  }
  return { policy, overrides };
}

function filterSearch(
  stores: AdversarialFixtureStore[],
  searchQ: string | null | undefined
): AdversarialFixtureStore[] {
  const q = searchQ?.trim() ?? "";
  if (q.length < 2) return stores;
  const needle = q.toLowerCase();
  return stores.filter((s) => {
    const name = (s.name ?? "").toLowerCase();
    return (
      s.slug.toLowerCase().includes(needle) ||
      s.id.toLowerCase().includes(needle) ||
      name.includes(needle)
    );
  });
}

function toShadowCandidate(
  s: AdversarialFixtureStore,
  opts: {
    distanceAxisEnabled: boolean;
    origin: { lat: number; lng: number };
    policy: DeliveryDistancePolicy;
    overrides: DeliveryStoreDistanceOverrides;
  }
): StoreDiscoveryShadowCandidate {
  const schedule = (
    s.forceSchedule !== undefined
      ? s.forceSchedule
      : computeDiscoveryScheduleProjection({
          business_hours_json: s.hours,
          is_open: s.is_open,
          point_commerce_blocked: s.point_commerce_blocked ?? false,
          now: new Date(CUT6_NOW_MS),
        }).discoveryScheduleState
  ) as StoreDiscoveryShadowCandidate["discovery_schedule_state"];

  let coverage: StoreDiscoveryShadowCandidate["coverage"] = {
    distanceApplies: false,
    coversAll: false,
    hasCoverageGeog: false,
    originCovered: false,
  };

  if (opts.distanceAxisEnabled && s.missingCoverage) {
    // Defined missing-projection semantics: distance applies but no geog → OOR (not G0 promotion).
    coverage = {
      distanceApplies: true,
      coversAll: false,
      hasCoverageGeog: false,
      originCovered: false,
    };
  } else if (opts.distanceAxisEnabled && !s.missingCoverage) {
    const built = buildStoreDeliveryCoverageProjection({
      storeId: s.id,
      lat: s.lat,
      lng: s.lng,
      policy: opts.policy,
      overrides: opts.overrides,
      policyVersion: 1,
      storePolicyVersion: 1,
    });
    let originCovered: boolean | null = null;
    if (!built.distanceApplies) {
      originCovered = false;
    } else if (built.coversAll) {
      originCovered = true;
    } else if (!built.hasCoords) {
      originCovered = false;
    } else {
      const d = haversineKm(opts.origin.lat, opts.origin.lng, built.lat, built.lng);
      const rounded = d == null ? null : Math.round(d * 1000) / 1000;
      originCovered =
        rounded != null && (built.effectiveMaxKm == null || rounded <= built.effectiveMaxKm);
    }
    coverage = {
      distanceApplies: built.distanceApplies,
      coversAll: built.coversAll,
      hasCoverageGeog: built.distanceApplies && !built.coversAll && built.hasCoords,
      originCovered,
    };
  }

  return {
    id: s.id,
    slug: s.slug,
    district: s.district,
    rating_avg: s.rating_avg,
    review_count: s.review_count,
    delivery_available: s.delivery_available,
    discovery_schedule_state: schedule,
    completed_orders_30d: s.completed_orders_30d,
    lat: s.lat,
    lng: s.lng,
    coverage,
  };
}

export type FirstDivergenceDetail = {
  caseName: string;
  index: number;
  oldId: string;
  newId: string;
  oldGi?: number;
  newGi?: number;
  oldDj?: number;
  newDj?: number;
  oldDistance?: number | null;
  newDistance?: number | null;
  oldOrders?: number;
  newOrders?: number;
  oldRating?: number | null;
  newRating?: number | null;
  exposure?: string;
};

export function enrichFirstDivergence(
  caseName: string,
  diff: ShadowParityDiff,
  oldRows: readonly StoreDiscoveryShadowRankedRow[] | readonly { id: string }[],
  newRows: readonly StoreDiscoveryShadowRankedRow[],
  stores: AdversarialFixtureStore[],
  exposure?: string
): FirstDivergenceDetail | null {
  if (!diff.firstDivergence) return null;
  const { index, oldId, newId } = diff.firstDivergence;
  const oldR = (oldRows as StoreDiscoveryShadowRankedRow[]).find((r) => r.id === oldId);
  const newR = newRows.find((r) => r.id === newId);
  const oldS = stores.find((s) => s.id === oldId);
  const newS = stores.find((s) => s.id === newId);
  return {
    caseName,
    index,
    oldId,
    newId,
    oldGi: (oldR as StoreDiscoveryShadowRankedRow | undefined)?.eligibilityRank,
    newGi: newR?.eligibilityRank,
    oldDj: (oldR as StoreDiscoveryShadowRankedRow | undefined)?.districtTier,
    newDj: newR?.districtTier,
    oldDistance: (oldR as StoreDiscoveryShadowRankedRow | undefined)?.distanceKm ?? null,
    newDistance: newR?.distanceKm ?? null,
    oldOrders: oldS?.completed_orders_30d,
    newOrders: newS?.completed_orders_30d,
    oldRating: oldS?.rating_avg ?? null,
    newRating: newS?.rating_avg ?? null,
    exposure,
  };
}

export function oldHomeOracle(
  stores: AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & {
    district: string | null;
    distanceAxisEnabled: boolean;
    searchQ?: string | null;
    limit?: number;
  }
) {
  const nowMs = opts.nowMs ?? CUT6_NOW_MS;
  const origin = opts.origin ?? CUT6_ORIGIN;
  const { policy, overrides } = resolvePolicyBundle(
    { ...opts, policy: { ...(opts.policy ?? DEFAULT_DELIVERY_DISTANCE_POLICY), enabled: opts.distanceAxisEnabled && (opts.policy?.enabled ?? true) } },
    stores
  );
  const list = filterSearch(stores, opts.searchQ);
  const eligibilityRankById = new Map<string, number>();
  const distanceKmById = new Map<string, number | null>();
  const outOfRangeById = new Map<string, boolean>();
  const completedOrderCount30dById = new Map<string, number>();

  const rows = list.map((s) => {
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides,
      storeId: s.id,
      customerLat: origin.lat,
      customerLng: origin.lng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange =
      svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const el = resolveStoreDiscoveryEligibility({
      business_hours_json: s.hours,
      is_open: s.is_open,
      point_commerce_blocked: s.point_commerce_blocked ?? false,
      delivery_available: s.delivery_available,
      distanceOutOfRange: outOfRange,
      now: new Date(nowMs),
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

  const exposureScope = buildStoreDiscoveryHomeExposureScope({
    region: null,
    district: opts.district,
    searchQ: opts.searchQ ?? null,
    originKey: `${origin.lat},${origin.lng}`,
    hasGeo: opts.distanceAxisEnabled,
    geoKey: "g",
  });

  const exposed = applyStoreDiscoveryExposureRotation({
    recommendedSorted: sorted,
    eligibilityRankById,
    exposureScope,
    nowMs,
  });

  return {
    rows: exposed.slice(0, opts.limit ?? 48),
    exposureScope,
    eligibilityRankById,
    outOfRangeById,
  };
}

export function newHomeShadow(
  stores: AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & {
    district: string | null;
    distanceAxisEnabled: boolean;
    searchQ?: string | null;
    limit?: number;
  }
) {
  const { origin, candidates } = buildAdversarialShadowCandidates(stores, opts);
  return newHomeShadowFromCandidates(candidates, { ...opts, origin });
}

export function oldBrowseOracle(
  stores: AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & {
    sort: StoreBrowseServerSortId;
    district: string | null;
    distanceAxisEnabled: boolean;
    page: number;
    limit: number;
    searchQ?: string | null;
    taxonomyCategoryId?: string | null;
  }
) {
  const nowMs = opts.nowMs ?? CUT6_NOW_MS;
  const origin = opts.origin ?? CUT6_ORIGIN;
  const { policy, overrides } = resolvePolicyBundle(
    {
      ...opts,
      policy: {
        ...(opts.policy ?? DEFAULT_DELIVERY_DISTANCE_POLICY),
        enabled: opts.distanceAxisEnabled && (opts.policy?.enabled ?? true),
      },
    },
    stores
  );
  let list = filterSearch(stores, opts.searchQ);
  if (opts.taxonomyCategoryId) {
    list = list.filter((s) => s.store_category_id === opts.taxonomyCategoryId);
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
      customerLat: origin.lat,
      customerLng: origin.lng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const outOfRange =
      svc.applies && (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const el = resolveStoreDiscoveryEligibility({
      business_hours_json: s.hours,
      is_open: s.is_open,
      point_commerce_blocked: s.point_commerce_blocked ?? false,
      delivery_available: s.delivery_available,
      distanceOutOfRange: outOfRange,
      now: new Date(nowMs),
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

  const exposureScope = buildStoreDiscoveryBrowseExposureScope({
    primary: "food",
    sub: "all",
    regionQ: "",
    cityQ: "",
    district: opts.district,
    geoPart: "g",
  });

  if (opts.sort === "default") {
    sorted = applyStoreDiscoveryExposureRotation({
      recommendedSorted: sorted,
      eligibilityRankById,
      exposureScope,
      nowMs,
    });
  }

  const pageStart = (opts.page - 1) * opts.limit;
  return {
    rows: sorted.slice(pageStart, pageStart + opts.limit),
    fullSequence: sorted,
    exposureScope,
    eligibilityRankById,
    outOfRangeById,
  };
}

function filterTaxonomyStores(
  stores: readonly AdversarialFixtureStore[],
  searchQ: string | null | undefined,
  taxonomyCategoryId: string | null | undefined
): AdversarialFixtureStore[] {
  let list = filterSearch([...stores], searchQ);
  if (taxonomyCategoryId) {
    list = list.filter((s) => s.store_category_id === taxonomyCategoryId);
  }
  return list;
}

function resolveHarnessOriginAndPolicy(
  stores: readonly AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & { distanceAxisEnabled: boolean }
) {
  const origin = opts.origin ?? CUT6_ORIGIN;
  const { policy, overrides } = resolvePolicyBundle(
    {
      ...opts,
      policy: {
        ...(opts.policy ?? DEFAULT_DELIVERY_DISTANCE_POLICY),
        enabled: opts.distanceAxisEnabled && (opts.policy?.enabled ?? true),
      },
    },
    [...stores]
  );
  return { origin, policy, overrides };
}

/** Build shadow candidates once — reuse across sort/page probes in dense parity tests. */
export function buildAdversarialShadowCandidates(
  stores: readonly AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & {
    distanceAxisEnabled: boolean;
    searchQ?: string | null;
    taxonomyCategoryId?: string | null;
  }
): { origin: { lat: number; lng: number }; candidates: StoreDiscoveryShadowCandidate[] } {
  const list = filterTaxonomyStores(stores, opts.searchQ, opts.taxonomyCategoryId);
  const { origin, policy, overrides } = resolveHarnessOriginAndPolicy(list, opts);
  const candidates = list.map((s) =>
    toShadowCandidate(s, {
      distanceAxisEnabled: opts.distanceAxisEnabled,
      origin,
      policy,
      overrides,
    })
  );
  return { origin, candidates };
}

export function newBrowseShadowFromCandidates(
  candidates: readonly StoreDiscoveryShadowCandidate[],
  opts: HarnessPolicyOpts & {
    sort: StoreBrowseServerSortId;
    district: string | null;
    distanceAxisEnabled: boolean;
    page: number;
    limit: number;
    origin?: { lat: number; lng: number };
  }
): {
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry: ShadowWaveTelemetry;
  exposureScope: string;
  candidates: StoreDiscoveryShadowCandidate[];
} {
  const nowMs = opts.nowMs ?? CUT6_NOW_MS;
  const origin = opts.origin ?? CUT6_ORIGIN;
  const exposureScope = buildStoreDiscoveryBrowseExposureScope({
    primary: "food",
    sub: "all",
    regionQ: "",
    cityQ: "",
    district: opts.district,
    geoPart: "g",
  });
  const ranked = rankStoreDiscoveryBrowseShadow({
    candidates,
    sort: opts.sort,
    district: opts.district,
    originLat: origin.lat,
    originLng: origin.lng,
    distanceAxisEnabled: opts.distanceAxisEnabled,
    page: opts.page,
    limit: opts.limit,
    exposureScope,
    nowMs,
  });
  return {
    rows: ranked.rows,
    telemetry: ranked.telemetry,
    exposureScope,
    candidates: [...candidates],
  };
}

export function newHomeShadowFromCandidates(
  candidates: readonly StoreDiscoveryShadowCandidate[],
  opts: HarnessPolicyOpts & {
    district: string | null;
    distanceAxisEnabled: boolean;
    searchQ?: string | null;
    limit?: number;
    origin?: { lat: number; lng: number };
  }
) {
  const nowMs = opts.nowMs ?? CUT6_NOW_MS;
  const origin = opts.origin ?? CUT6_ORIGIN;
  const exposureScope = buildStoreDiscoveryHomeExposureScope({
    region: null,
    district: opts.district,
    searchQ: opts.searchQ ?? null,
    originKey: `${origin.lat},${origin.lng}`,
    hasGeo: opts.distanceAxisEnabled,
    geoKey: "g",
  });
  const ranked = rankStoreDiscoveryHomeShadow({
    candidates,
    district: opts.district,
    originLat: origin.lat,
    originLng: origin.lng,
    distanceAxisEnabled: opts.distanceAxisEnabled,
    exposureScope,
    nowMs,
    limit: opts.limit,
  });
  return { ...ranked, exposureScope, candidates: [...candidates] };
}

export function newBrowseShadow(
  stores: AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & {
    sort: StoreBrowseServerSortId;
    district: string | null;
    distanceAxisEnabled: boolean;
    page: number;
    limit: number;
    searchQ?: string | null;
    taxonomyCategoryId?: string | null;
  }
): {
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry: ShadowWaveTelemetry;
  exposureScope: string;
  candidates: StoreDiscoveryShadowCandidate[];
} {
  const { origin, candidates } = buildAdversarialShadowCandidates(stores, opts);
  return newBrowseShadowFromCandidates(candidates, { ...opts, origin });
}

export function assertParityOrDetail(
  caseName: string,
  oldRows: readonly { id: string }[],
  newRows: readonly StoreDiscoveryShadowRankedRow[],
  stores: AdversarialFixtureStore[],
  exposure?: string
): ShadowParityDiff {
  const diff = compareStoreDiscoveryShadowParity(oldRows, newRows);
  if (diff.firstDivergence || diff.membershipDiff.length || diff.lengthMismatch) {
    const detail = enrichFirstDivergence(caseName, diff, oldRows, newRows, stores, exposure);
    throw new Error(
      [
        `CUT6 ${caseName} FIRST DIVERGENCE`,
        JSON.stringify(detail, null, 2),
        `membership=${diff.membershipDiff.join(",") || "none"}`,
        `len ${diff.oldLength}/${diff.newLength}`,
      ].join("\n")
    );
  }
  return diff;
}

export function coverageMembershipParity(
  stores: AdversarialFixtureStore[],
  opts: HarnessPolicyOpts & { distanceAxisEnabled: boolean }
): { assignmentDiff: number; details: string[] } {
  const origin = opts.origin ?? CUT6_ORIGIN;
  const { policy, overrides } = resolvePolicyBundle(
    {
      ...opts,
      policy: {
        ...(opts.policy ?? DEFAULT_DELIVERY_DISTANCE_POLICY),
        enabled: opts.distanceAxisEnabled && (opts.policy?.enabled ?? true),
      },
    },
    stores
  );
  const details: string[] = [];
  let assignmentDiff = 0;
  for (const s of stores) {
    const svc = evaluateDeliveryServiceability({
      policy,
      overrides,
      storeId: s.id,
      customerLat: origin.lat,
      customerLng: origin.lng,
      storeLat: s.lat,
      storeLng: s.lng,
    });
    const oldOor =
      opts.distanceAxisEnabled &&
      svc.applies &&
      (svc.reason === "out_of_range" || svc.reason === "missing_store_coords");
    const cand = toShadowCandidate(s, {
      distanceAxisEnabled: opts.distanceAxisEnabled,
      origin,
      policy,
      overrides,
    });
    const mem = resolveShadowCoverageMembership(cand.coverage, {
      hasOrigin: true,
      distanceAxisEnabled: opts.distanceAxisEnabled,
    });
    if (Boolean(oldOor) !== Boolean(mem.outOfRange)) {
      assignmentDiff += 1;
      details.push(`${s.id}: oldOor=${oldOor} newOor=${mem.outOfRange} reason=${mem.reason}`);
    }
  }
  return { assignmentDiff, details };
}

export function districtTierParitySamples(): Array<{
  store: string | null;
  filter: string | null;
  old: number;
  neu: number;
}> {
  const samples: Array<[string | null, string | null]> = [
    ["Pasay", "Pasay"],
    ["Pasay City", "Pasay"],
    ["City of Pasay", "Pasay"],
    ["Pas", "Pasay"],
    ["Manila", "Pasay"],
    [null, "Pasay"],
    ["", "Pasay"],
    ["  PASAY  ", "pasay"],
    ["Makati", "Makati Central"],
    ["Quezon City", "Quezon"],
  ];
  return samples.map(([store, filter]) => ({
    store,
    filter,
    old: districtRank(store, filter),
    neu: shadowDistrictTier(store, filter),
  }));
}

export type CaseResult = {
  caseId: string;
  status: "PASS" | "FAIL" | "NOT_RUN";
  fixtureSize?: number;
  membershipDiff?: number;
  orderDiff?: number;
  firstDivergence?: FirstDivergenceDetail | null;
  notes?: string;
};

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
