import { districtRank } from "@/lib/geo/haversine-km";
import { compareStoreDiscoveryEligibilityRank } from "@/lib/stores/store-discovery-eligibility";
import type { StoreDiscoverySortRow, StoreDiscoverySortContext } from "@/lib/stores/store-discovery-browse-sort";

export type StoreDiscoveryRecommendedRow = StoreDiscoverySortRow;

import type { StoreCompletedOrderCountLoadStatus } from "@/lib/stores/store-discovery-popular-store";

export type StoreDiscoveryRecommendedContext = {
  district: string | null;
  eligibilityRankById: Map<string, number>;
  distanceKmById: Map<string, number | null> | null;
  outOfRangeById: Map<string, boolean> | null;
  hasGeo: boolean;
  completedOrderCount30dById: Map<string, number> | null;
  completedOrderCountStatus: StoreCompletedOrderCountLoadStatus;
};

function stableSlug(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const bySlug = String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  if (bySlug !== 0) return bySlug;
  return String(a.id).localeCompare(String(b.id));
}

function canonicalRatingValue(row: StoreDiscoverySortRow): number | null {
  if (row.rating_avg == null || !Number.isFinite(Number(row.rating_avg))) return null;
  return Number(row.rating_avg);
}

function canonicalReviewCount(row: StoreDiscoverySortRow): number {
  const n = row.review_count ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function ratingOnlyCmp(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const ra = canonicalRatingValue(a);
  const rb = canonicalRatingValue(b);
  if (ra != null && rb != null && ra !== rb) return rb - ra;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  return 0;
}

function reviewCountCmp(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  return canonicalReviewCount(b) - canonicalReviewCount(a);
}

function outOfRangeCmp(
  ctx: StoreDiscoveryRecommendedContext,
  a: StoreDiscoverySortRow,
  b: StoreDiscoverySortRow
): number {
  if (!ctx.outOfRangeById) return 0;
  const ao = ctx.outOfRangeById.get(a.id) === true ? 1 : 0;
  const bo = ctx.outOfRangeById.get(b.id) === true ? 1 : 0;
  return ao - bo;
}

function districtCmp(ctx: StoreDiscoveryRecommendedContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  return districtRank(a.district, ctx.district) - districtRank(b.district, ctx.district);
}

function distanceCmp(
  ctx: StoreDiscoveryRecommendedContext,
  a: StoreDiscoverySortRow,
  b: StoreDiscoverySortRow
): number {
  if (!ctx.distanceKmById) return 0;
  const da = ctx.distanceKmById.get(a.id) ?? null;
  const db = ctx.distanceKmById.get(b.id) ?? null;
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return 0;
}

function completedOrderCountCmp(
  ctx: StoreDiscoveryRecommendedContext,
  a: StoreDiscoverySortRow,
  b: StoreDiscoverySortRow
): number {
  if (ctx.completedOrderCountStatus !== "ok" || !ctx.completedOrderCount30dById) return 0;
  const ac = ctx.completedOrderCount30dById.get(a.id) ?? 0;
  const bc = ctx.completedOrderCount30dById.get(b.id) ?? 0;
  if (ac !== bc) return bc - ac;
  return 0;
}

/**
 * Canonical HOME/BROWSE default (recommended) comparator — deterministic, no weighted score.
 * Order: eligibility → outOfRange → district → distance → completedOrderCount30d → rating → reviewCount → slug.
 */
export function compareStoreDiscoveryRecommendedRows(
  ctx: StoreDiscoveryRecommendedContext,
  a: StoreDiscoveryRecommendedRow,
  b: StoreDiscoveryRecommendedRow
): number {
  const ar = ctx.eligibilityRankById.get(a.id) ?? 99;
  const br = ctx.eligibilityRankById.get(b.id) ?? 99;
  const er = compareStoreDiscoveryEligibilityRank(ar, br);
  if (er !== 0) return er;

  if (ctx.hasGeo) {
    const oor = outOfRangeCmp(ctx, a, b);
    if (oor !== 0) return oor;
  }

  const dr = districtCmp(ctx, a, b);
  if (dr !== 0) return dr;

  if (ctx.hasGeo) {
    const dist = distanceCmp(ctx, a, b);
    if (dist !== 0) return dist;
  }

  const orders = completedOrderCountCmp(ctx, a, b);
  if (orders !== 0) return orders;

  const rated = ratingOnlyCmp(a, b);
  if (rated !== 0) return rated;

  const rev = reviewCountCmp(a, b);
  if (rev !== 0) return rev;

  return stableSlug(a, b);
}

export function sortStoreDiscoveryRecommendedRows<T extends StoreDiscoveryRecommendedRow>(
  rows: T[],
  ctx: StoreDiscoveryRecommendedContext
): T[] {
  return [...rows].sort((a, b) => compareStoreDiscoveryRecommendedRows(ctx, a, b));
}

export function toStoreDiscoveryRecommendedContext(
  ctx: Omit<StoreDiscoverySortContext, "sort"> & {
    completedOrderCountStatus: StoreCompletedOrderCountLoadStatus;
  }
): StoreDiscoveryRecommendedContext {
  return {
    district: ctx.district,
    eligibilityRankById: ctx.eligibilityRankById,
    distanceKmById: ctx.distanceKmById,
    outOfRangeById: ctx.outOfRangeById,
    hasGeo: ctx.hasGeo,
    completedOrderCount30dById: ctx.completedOrderCount30dById ?? null,
    completedOrderCountStatus: ctx.completedOrderCountStatus,
  };
}
