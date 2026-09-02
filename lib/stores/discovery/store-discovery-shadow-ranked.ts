/**
 * CUT 4 — Bounded Gi×Dj wave ranking (SHADOW ONLY).
 * No full-candidate sort. No arbitrary candidate cap.
 * Pagination: bounded offset window via waves (URL page preserved).
 */

import { haversineKm } from "@/lib/geo/haversine-km";
import {
  compareStoreDiscoveryBrowseRows,
  type StoreBrowseServerSortId,
  type StoreDiscoverySortContext,
  type StoreDiscoverySortRow,
} from "@/lib/stores/store-discovery-browse-sort";
import {
  applyStoreDiscoveryExposureRotation,
  buildStoreDiscoveryBrowseExposureScope,
  buildStoreDiscoveryHomeExposureScope,
  STORE_DISCOVERY_EXPOSURE_BAND_SIZE,
} from "@/lib/stores/store-discovery-exposure";
import { STORE_HOME_FEED_RESPONSE_MAX } from "@/lib/stores/store-discovery-candidate";
import { BROWSE_STORE_FETCH_CAP, BROWSE_STORE_LIMIT } from "@/lib/stores/stores-browse-build";
import { resolveShadowCoverageMembership } from "@/lib/stores/discovery/shadow-coverage-membership";
import { shadowDistrictTier } from "@/lib/stores/discovery/shadow-district-tier";
import {
  resolveShadowEligibilityFromProjection,
  type DiscoveryScheduleStateProjection,
} from "@/lib/stores/discovery/shadow-eligibility";

/** @deprecated CUT 4 removed arbitrary caps — kept export as 0 sentinel for guards */
export const STORE_DISCOVERY_SHADOW_BROWSE_MAX_CANDIDATES = 0;

export const SHADOW_PAGINATION_ARCHITECTURE = "bounded_offset_via_gi_dj_waves" as const;

export type StoreDiscoveryShadowCandidate = {
  id: string;
  slug: string;
  district: string | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  discovery_schedule_state: DiscoveryScheduleStateProjection;
  completed_orders_30d: number;
  lat: number | null;
  lng: number | null;
  coverage: {
    distanceApplies: boolean;
    coversAll: boolean;
    hasCoverageGeog: boolean;
    originCovered: boolean | null;
  } | null;
};

export type StoreDiscoveryShadowRankedRow = StoreDiscoverySortRow & {
  eligibilityRank: number;
  eligibilityState: string;
  districtTier: number;
  distanceKm: number | null;
  outOfRange: boolean;
  completedOrders30d: number;
};

export type ShadowWaveTelemetry = {
  wavesExecuted: number;
  rowsReturned: number;
  paginationArchitecture: typeof SHADOW_PAGINATION_ARCHITECTURE;
  pageContinuationMode: "bounded_offset_window";
  groupCounts: Record<number, number>;
};

function roundDistanceKm(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.round(raw * 1000) / 1000;
}

function enrichCandidate(
  c: StoreDiscoveryShadowCandidate,
  opts: {
    district: string | null;
    originLat: number | null;
    originLng: number | null;
    distanceAxisEnabled: boolean;
  }
): StoreDiscoveryShadowRankedRow {
  const hasOrigin = opts.originLat != null && opts.originLng != null;
  const membership = resolveShadowCoverageMembership(c.coverage, {
    hasOrigin,
    distanceAxisEnabled: opts.distanceAxisEnabled,
  });
  const el = resolveShadowEligibilityFromProjection({
    discoveryScheduleState: c.discovery_schedule_state,
    deliveryAvailable: c.delivery_available,
    outOfRange: membership.outOfRange,
  });
  let distanceKm: number | null = null;
  // Parity with evaluateDeliveryServiceability: distanceKm only when distance axis applies.
  if (
    opts.distanceAxisEnabled &&
    hasOrigin &&
    membership.distanceApplies &&
    c.lat != null &&
    c.lng != null
  ) {
    distanceKm = roundDistanceKm(haversineKm(opts.originLat!, opts.originLng!, c.lat, c.lng));
  }
  return {
    id: c.id,
    slug: c.slug,
    district: c.district,
    rating_avg: c.rating_avg,
    review_count: c.review_count,
    eligibilityRank: el.rank,
    eligibilityState: el.state,
    districtTier: shadowDistrictTier(c.district, opts.district),
    distanceKm,
    outOfRange: membership.outOfRange,
    completedOrders30d: Math.max(0, Math.floor(Number(c.completed_orders_30d) || 0)),
  };
}

function canonicalRating(row: StoreDiscoveryShadowRankedRow): number | null {
  if (row.rating_avg == null || !Number.isFinite(Number(row.rating_avg))) return null;
  return Number(row.rating_avg);
}

function canonicalReviews(row: StoreDiscoveryShadowRankedRow): number {
  const n = row.review_count ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function stableSlugCmp(a: StoreDiscoveryShadowRankedRow, b: StoreDiscoveryShadowRankedRow): number {
  const bySlug = String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  if (bySlug !== 0) return bySlug;
  return String(a.id).localeCompare(String(b.id));
}

/** Build browse-sort context once per wave — never per comparator invocation. */
function buildBrowseSortContextFromEnrichedRows(
  rows: readonly StoreDiscoveryShadowRankedRow[],
  sort: StoreBrowseServerSortId,
  district: string | null,
  hasGeo: boolean
): StoreDiscoverySortContext {
  const eligibilityRankById = new Map<string, number>();
  const distanceKmById = new Map<string, number | null>();
  const outOfRangeById = new Map<string, boolean>();
  const completedOrderCount30dById = new Map<string, number>();
  for (const row of rows) {
    eligibilityRankById.set(row.id, row.eligibilityRank);
    distanceKmById.set(row.id, row.distanceKm);
    outOfRangeById.set(row.id, row.outOfRange);
    completedOrderCount30dById.set(row.id, row.completedOrders30d);
  }
  const needsOrders = sort === "default" || sort === "popular";
  return {
    district,
    sort,
    eligibilityRankById,
    distanceKmById: hasGeo ? distanceKmById : null,
    outOfRangeById: hasGeo ? outOfRangeById : null,
    hasGeo,
    completedOrderCount30dById: needsOrders ? completedOrderCount30dById : null,
    completedOrderCountStatus: "ok",
  };
}

function sortShadowWaveRowsInPlace(
  rows: StoreDiscoveryShadowRankedRow[],
  sort: StoreBrowseServerSortId | "home",
  hasGeo: boolean,
  district: string | null
): void {
  if (sort === "home") {
    rows.sort((a, b) => compareShadowHomeWaveRows(hasGeo, a, b));
    return;
  }
  const ctx = buildBrowseSortContextFromEnrichedRows(rows, sort, district, hasGeo);
  rows.sort((a, b) => compareStoreDiscoveryBrowseRows(ctx, a, b));
}

function compareShadowHomeWaveRows(
  hasGeo: boolean,
  a: StoreDiscoveryShadowRankedRow,
  b: StoreDiscoveryShadowRankedRow
): number {
  // HOME recommended within Gi×Dj — not browse default.
  // Parity with compareStoreDiscoveryRecommendedRows:
  // eligibility (fixed) → outOfRange → district → distance → orders → ...
  if (hasGeo) {
    const ao = a.outOfRange === true ? 1 : 0;
    const bo = b.outOfRange === true ? 1 : 0;
    if (ao !== bo) return ao - bo;
  }
  if (a.districtTier !== b.districtTier) {
    return a.districtTier - b.districtTier;
  }
  if (hasGeo) {
    const da = a.distanceKm;
    const db = b.distanceKm;
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
  }
  if (a.completedOrders30d !== b.completedOrders30d) {
    return b.completedOrders30d - a.completedOrders30d;
  }
  const ra = canonicalRating(a);
  const rb = canonicalRating(b);
  if (ra != null && rb != null && ra !== rb) return rb - ra;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  const rev = canonicalReviews(b) - canonicalReviews(a);
  if (rev !== 0) return rev;
  return stableSlugCmp(a, b);
}

export function compareShadowWaveRows(
  sort: StoreBrowseServerSortId | "home",
  hasGeo: boolean,
  a: StoreDiscoveryShadowRankedRow,
  b: StoreDiscoveryShadowRankedRow,
  district: string | null = null
): number {
  if (sort === "home") {
    return compareShadowHomeWaveRows(hasGeo, a, b);
  }
  const ctx = buildBrowseSortContextFromEnrichedRows([a, b], sort, district, hasGeo);
  return compareStoreDiscoveryBrowseRows(ctx, a, b);
}

export type ShadowWaveFetchFn = (input: {
  eligibilityRank: number;
  districtTier: number;
  limit: number;
}) => StoreDiscoveryShadowRankedRow[] | Promise<StoreDiscoveryShadowRankedRow[]>;

/**
 * In-memory wave fetcher for fixtures/tests.
 * Scans pool only to select matching Gi×Dj, sorts THAT WAVE SUBSET only (not full pool).
 */
export function createInMemoryShadowWaveFetcher(
  pool: readonly StoreDiscoveryShadowCandidate[],
  opts: {
    district: string | null;
    originLat: number | null;
    originLng: number | null;
    distanceAxisEnabled: boolean;
    sort: StoreBrowseServerSortId | "home";
  }
): ShadowWaveFetchFn {
  const hasGeo = opts.distanceAxisEnabled && opts.originLat != null && opts.originLng != null;
  const enriched = pool.map((c) => enrichCandidate(c, opts));
  const useDj = waveUsesDistrictTier(opts.sort, hasGeo, opts.district);

  const buckets = new Map<string, StoreDiscoveryShadowRankedRow[]>();
  for (const row of enriched) {
    const key = useDj ? `${row.eligibilityRank}:${row.districtTier}` : `${row.eligibilityRank}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const sortedCache = new Map<string, StoreDiscoveryShadowRankedRow[]>();
  const bucketKey = (eligibilityRank: number, districtTier: number) =>
    useDj ? `${eligibilityRank}:${districtTier}` : `${eligibilityRank}`;

  return ({ eligibilityRank, districtTier, limit }) => {
    const key = bucketKey(eligibilityRank, districtTier);
    let sorted = sortedCache.get(key);
    if (!sorted) {
      sorted = [...(buckets.get(key) ?? [])];
      // Sort ONLY this Gi (×Dj) bucket — never the full pool.
      sortShadowWaveRowsInPlace(sorted, opts.sort, hasGeo, opts.district);
      sortedCache.set(key, sorted);
    }
    return sorted.slice(0, Math.max(0, limit));
  };
}

async function resolveWave(
  fetchWave: ShadowWaveFetchFn,
  input: { eligibilityRank: number; districtTier: number; limit: number }
): Promise<StoreDiscoveryShadowRankedRow[]> {
  if (input.limit <= 0) return [];
  return Promise.resolve(fetchWave(input));
}

/**
 * HOME + browse default keep 6-stage Gi waves (internal ranking).
 * Customer sorts use the customer 2-group: rank0 = GROUP_A, ranks 1–5 = one GROUP_B pool.
 */
export function browseEligibilityGiBatches(
  sort: StoreBrowseServerSortId | "home"
): readonly (readonly number[])[] {
  if (sort === "home" || sort === "default") {
    return [[0], [1], [2], [3], [4], [5]];
  }
  return [[0], [1, 2, 3, 4, 5]];
}

function districtTiersToScan(
  district: string | null,
  sort: StoreBrowseServerSortId | "home",
  hasGeo: boolean
): number[] {
  // Dj is only a sort key in recommended/default (HOME + browse default).
  // rating/reviews/popular/distance: eligibility first, then mode keys — no Dj split.
  if (sort !== "home" && sort !== "default") return [0];
  if (!district?.trim()) return [0];
  // When hasGeo, OLD comparator applies outOfRange BEFORE district.
  // Dj-first waves would promote D0+OOR over D1+in-range — FAIL parity.
  // Use one wave per Gi and sort district inside the wave comparator.
  if (hasGeo) return [0];
  return [0, 1, 2];
}

function waveUsesDistrictTier(
  sort: StoreBrowseServerSortId | "home",
  hasGeo: boolean,
  district: string | null
): boolean {
  if (sort !== "home" && sort !== "default") return false;
  if (!district?.trim()) return false;
  // See districtTiersToScan — geo path sorts Dj inside comparator.
  if (hasGeo) return false;
  return true;
}

/**
 * Fill `targetCount` rows via Gi×Dj waves + per-group exposure.
 * Maximum rows fetched ≈ targetCount + bandSlack per active group — not catalog size.
 */
export async function fillShadowRankedViaWaves(input: {
  fetchWave: ShadowWaveFetchFn;
  district: string | null;
  sort: StoreBrowseServerSortId | "home";
  exposureScope: string | null;
  applyExposure: boolean;
  targetCount: number;
  nowMs?: number;
  /** When true, Dj is sorted inside wave (OOR-before-district parity). */
  hasGeo?: boolean;
}): Promise<{
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry: ShadowWaveTelemetry;
  eligibilityRankById: Map<string, number>;
}> {
  const target = Math.max(0, Math.floor(input.targetCount));
  const bandSlack = STORE_DISCOVERY_EXPOSURE_BAND_SIZE - 1;
  const out: StoreDiscoveryShadowRankedRow[] = [];
  const eligibilityRankById = new Map<string, number>();
  const telemetry: ShadowWaveTelemetry = {
    wavesExecuted: 0,
    rowsReturned: 0,
    paginationArchitecture: SHADOW_PAGINATION_ARCHITECTURE,
    pageContinuationMode: "bounded_offset_window",
    groupCounts: {},
  };

  if (target === 0) {
    return { rows: out, telemetry, eligibilityRankById };
  }

  let remaining = target;
  const hasGeo = input.hasGeo === true;
  const djList = districtTiersToScan(input.district, input.sort, hasGeo);
  const giBatches = browseEligibilityGiBatches(input.sort);

  for (const giBatch of giBatches) {
    if (remaining <= 0) break;

    const groupNeed = remaining + (input.applyExposure ? bandSlack : 0);
    const groupBuf: StoreDiscoveryShadowRankedRow[] = [];
    const mergeCustomerGroup = giBatch.length > 1;

    for (const gi of giBatch) {
      for (const dj of djList) {
        if (!mergeCustomerGroup && groupBuf.length >= groupNeed) break;
        const limit = mergeCustomerGroup ? groupNeed : groupNeed - groupBuf.length;
        const wave = await resolveWave(input.fetchWave, {
          eligibilityRank: gi,
          districtTier: dj,
          limit,
        });
        telemetry.wavesExecuted += 1;
        telemetry.rowsReturned += wave.length;
        for (const row of wave) {
          groupBuf.push(row);
          eligibilityRankById.set(row.id, row.eligibilityRank);
        }
      }
    }

    if (mergeCustomerGroup) {
      sortShadowWaveRowsInPlace(groupBuf, input.sort, hasGeo, input.district);
    }

    telemetry.groupCounts[giBatch[0] ?? 0] = groupBuf.length;
    if (groupBuf.length === 0) continue;

    let exposed = groupBuf;
    if (input.applyExposure && input.exposureScope) {
      exposed = applyStoreDiscoveryExposureRotation({
        recommendedSorted: groupBuf,
        eligibilityRankById,
        exposureScope: input.exposureScope,
        nowMs: input.nowMs,
      });
    }

    const take = exposed.slice(0, remaining);
    out.push(...take);
    remaining -= take.length;
  }

  return { rows: out, telemetry, eligibilityRankById };
}

export type ShadowHomeRankResult = {
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry: ShadowWaveTelemetry;
  eligibilityRankById: Map<string, number>;
};

export async function rankStoreDiscoveryHomeShadowWaves(input: {
  fetchWave: ShadowWaveFetchFn;
  district: string | null;
  exposureScope: string;
  nowMs?: number;
  limit?: number;
  hasGeo?: boolean;
}): Promise<ShadowHomeRankResult> {
  const limit = Math.max(1, Math.min(input.limit ?? STORE_HOME_FEED_RESPONSE_MAX, STORE_HOME_FEED_RESPONSE_MAX));
  const filled = await fillShadowRankedViaWaves({
    fetchWave: input.fetchWave,
    district: input.district,
    sort: "home",
    exposureScope: input.exposureScope,
    applyExposure: true,
    targetCount: limit,
    nowMs: input.nowMs,
    hasGeo: input.hasGeo === true,
  });
  return {
    rows: filled.rows,
    telemetry: filled.telemetry,
    eligibilityRankById: filled.eligibilityRankById,
  };
}

/** Fixture helper — builds in-memory wave fetcher then ranks HOME. */
export function rankStoreDiscoveryHomeShadow(input: {
  candidates: readonly StoreDiscoveryShadowCandidate[];
  district: string | null;
  originLat: number | null;
  originLng: number | null;
  distanceAxisEnabled: boolean;
  exposureScope: string;
  nowMs?: number;
  limit?: number;
}): ShadowHomeRankResult {
  return rankStoreDiscoveryHomeShadowSync(input);
}

function rankStoreDiscoveryHomeShadowSync(input: {
  candidates: readonly StoreDiscoveryShadowCandidate[];
  district: string | null;
  originLat: number | null;
  originLng: number | null;
  distanceAxisEnabled: boolean;
  exposureScope: string;
  nowMs?: number;
  limit?: number;
}): ShadowHomeRankResult {
  const fetchWave = createInMemoryShadowWaveFetcher(input.candidates, {
    district: input.district,
    originLat: input.originLat,
    originLng: input.originLng,
    distanceAxisEnabled: input.distanceAxisEnabled,
    sort: "home",
  });
  const limit = Math.max(1, Math.min(input.limit ?? STORE_HOME_FEED_RESPONSE_MAX, STORE_HOME_FEED_RESPONSE_MAX));
  const bandSlack = STORE_DISCOVERY_EXPOSURE_BAND_SIZE - 1;
  const out: StoreDiscoveryShadowRankedRow[] = [];
  const eligibilityRankById = new Map<string, number>();
  const telemetry: ShadowWaveTelemetry = {
    wavesExecuted: 0,
    rowsReturned: 0,
    paginationArchitecture: SHADOW_PAGINATION_ARCHITECTURE,
    pageContinuationMode: "bounded_offset_window",
    groupCounts: {},
  };
  let remaining = limit;
  const hasGeo = input.distanceAxisEnabled && input.originLat != null && input.originLng != null;
  const djList = districtTiersToScan(input.district, "home", hasGeo);

  for (let gi = 0; gi <= 5; gi += 1) {
    if (remaining <= 0) break;
    const groupNeed = remaining + bandSlack;
    const groupBuf: StoreDiscoveryShadowRankedRow[] = [];
    for (const dj of djList) {
      if (groupBuf.length >= groupNeed) break;
      const wave = fetchWave({
        eligibilityRank: gi,
        districtTier: dj,
        limit: groupNeed - groupBuf.length,
      }) as StoreDiscoveryShadowRankedRow[];
      telemetry.wavesExecuted += 1;
      telemetry.rowsReturned += wave.length;
      for (const row of wave) {
        groupBuf.push(row);
        eligibilityRankById.set(row.id, row.eligibilityRank);
      }
    }
    telemetry.groupCounts[gi] = groupBuf.length;
    if (groupBuf.length === 0) continue;
    const exposed = applyStoreDiscoveryExposureRotation({
      recommendedSorted: groupBuf,
      eligibilityRankById,
      exposureScope: input.exposureScope,
      nowMs: input.nowMs,
    });
    const take = exposed.slice(0, remaining);
    out.push(...take);
    remaining -= take.length;
  }

  return { rows: out, telemetry, eligibilityRankById };
}

export type ShadowBrowseRankResult = {
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry: ShadowWaveTelemetry;
  page: number;
  limit: number;
  eligibilityRankById: Map<string, number>;
  /** Always false in CUT 4 — no candidate cap truncation */
  truncatedCandidates: false;
  totalPrePage: number;
};

export function rankStoreDiscoveryBrowseShadow(input: {
  candidates: readonly StoreDiscoveryShadowCandidate[];
  sort: StoreBrowseServerSortId;
  district: string | null;
  originLat: number | null;
  originLng: number | null;
  distanceAxisEnabled: boolean;
  page: number;
  limit: number;
  exposureScope?: string;
  nowMs?: number;
}): ShadowBrowseRankResult {
  const page = Math.max(1, Math.floor(input.page) || 1);
  const limit = Math.max(1, Math.min(BROWSE_STORE_FETCH_CAP, Math.floor(input.limit) || BROWSE_STORE_LIMIT));
  const pageEnd = page * limit;
  const pageStart = (page - 1) * limit;
  const applyExposure = input.sort === "default" && Boolean(input.exposureScope);

  const fetchWave = createInMemoryShadowWaveFetcher(input.candidates, {
    district: input.district,
    originLat: input.originLat,
    originLng: input.originLng,
    distanceAxisEnabled: input.distanceAxisEnabled,
    sort: input.sort,
  });

  const bandSlack = applyExposure ? STORE_DISCOVERY_EXPOSURE_BAND_SIZE - 1 : 0;
  const outPrefix: StoreDiscoveryShadowRankedRow[] = [];
  const eligibilityRankById = new Map<string, number>();
  const telemetry: ShadowWaveTelemetry = {
    wavesExecuted: 0,
    rowsReturned: 0,
    paginationArchitecture: SHADOW_PAGINATION_ARCHITECTURE,
    pageContinuationMode: "bounded_offset_window",
    groupCounts: {},
  };

  let remaining = pageEnd;
  const hasGeo = input.distanceAxisEnabled && input.originLat != null && input.originLng != null;
  const djList = districtTiersToScan(input.district, input.sort, hasGeo);
  const giBatches = browseEligibilityGiBatches(input.sort);

  for (const giBatch of giBatches) {
    if (remaining <= 0) break;
    const groupNeed = remaining + bandSlack;
    const groupBuf: StoreDiscoveryShadowRankedRow[] = [];
    const mergeCustomerGroup = giBatch.length > 1;
    for (const gi of giBatch) {
      for (const dj of djList) {
        if (!mergeCustomerGroup && groupBuf.length >= groupNeed) break;
        const limit = mergeCustomerGroup ? groupNeed : groupNeed - groupBuf.length;
        const wave = fetchWave({
          eligibilityRank: gi,
          districtTier: dj,
          limit,
        }) as StoreDiscoveryShadowRankedRow[];
        telemetry.wavesExecuted += 1;
        telemetry.rowsReturned += wave.length;
        for (const row of wave) {
          groupBuf.push(row);
          eligibilityRankById.set(row.id, row.eligibilityRank);
        }
      }
    }
    if (mergeCustomerGroup) {
      sortShadowWaveRowsInPlace(groupBuf, input.sort, hasGeo, input.district);
    }
    telemetry.groupCounts[giBatch[0] ?? 0] = (telemetry.groupCounts[giBatch[0] ?? 0] ?? 0) + groupBuf.length;
    if (groupBuf.length === 0) continue;

    let exposed = groupBuf;
    if (applyExposure && input.exposureScope) {
      exposed = applyStoreDiscoveryExposureRotation({
        recommendedSorted: groupBuf,
        eligibilityRankById,
        exposureScope: input.exposureScope,
        nowMs: input.nowMs,
      });
    }
    const take = exposed.slice(0, remaining);
    outPrefix.push(...take);
    remaining -= take.length;
  }

  return {
    rows: outPrefix.slice(pageStart, pageEnd),
    telemetry,
    page,
    limit,
    eligibilityRankById,
    truncatedCandidates: false,
    totalPrePage: outPrefix.length,
  };
}

export { buildStoreDiscoveryHomeExposureScope, buildStoreDiscoveryBrowseExposureScope };
