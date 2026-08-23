import { districtRank } from "@/lib/geo/haversine-km";
import { compareStoreDiscoveryEligibilityRank } from "@/lib/stores/store-discovery-eligibility";
import type { StoreCompletedOrderCountLoadStatus } from "@/lib/stores/store-discovery-popular-store";
import {
  compareStoreDiscoveryRecommendedRows,
  sortStoreDiscoveryRecommendedRows,
  toStoreDiscoveryRecommendedContext,
} from "@/lib/stores/store-discovery-recommended-ranking";

export type StoreBrowseServerSortId =
  | "default"
  | "distance"
  | "rating"
  | "reviews"
  | "popular"
  | "fast";

const VALID_SORTS = new Set<StoreBrowseServerSortId>([
  "default",
  "distance",
  "rating",
  "reviews",
  "popular",
  "fast",
]);

export function parseStoreBrowseServerSortParam(
  raw: string | null | undefined
): StoreBrowseServerSortId {
  const s = raw?.trim().toLowerCase();
  if (s && VALID_SORTS.has(s as StoreBrowseServerSortId)) return s as StoreBrowseServerSortId;
  return "default";
}

export type StoreDiscoverySortRow = {
  id: string;
  slug: string;
  district: string | null;
  rating_avg: number | null;
  review_count: number | null;
};

export type StoreDiscoverySortContext = {
  district: string | null;
  sort: StoreBrowseServerSortId;
  eligibilityRankById: Map<string, number>;
  distanceKmById: Map<string, number | null> | null;
  outOfRangeById: Map<string, boolean> | null;
  hasGeo: boolean;
  /** P1-A / CUT1 — default + popular */
  completedOrderCount30dById?: Map<string, number> | null;
  completedOrderCountStatus?: StoreCompletedOrderCountLoadStatus;
  /**
   * `sort=fast` only — raw explicit prep minutes by store id.
   * null entry / missing key = UNKNOWN (sort after configured).
   */
  explicitPrepMinutesById?: Map<string, number | null> | null;
};

function stableSlug(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const bySlug = String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  if (bySlug !== 0) return bySlug;
  return String(a.id).localeCompare(String(b.id));
}

function eligibilityCmp(ctx: StoreDiscoverySortContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const ar = ctx.eligibilityRankById.get(a.id) ?? 99;
  const br = ctx.eligibilityRankById.get(b.id) ?? 99;
  const er = compareStoreDiscoveryEligibilityRank(ar, br);
  if (er !== 0) return er;
  return 0;
}

function outOfRangeCmp(ctx: StoreDiscoverySortContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  if (!ctx.outOfRangeById) return 0;
  const ao = ctx.outOfRangeById.get(a.id) === true ? 1 : 0;
  const bo = ctx.outOfRangeById.get(b.id) === true ? 1 : 0;
  return ao - bo;
}

function districtCmp(ctx: StoreDiscoverySortContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  return districtRank(a.district, ctx.district) - districtRank(b.district, ctx.district);
}

function distanceCmp(ctx: StoreDiscoverySortContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  if (!ctx.distanceKmById) return 0;
  const da = ctx.distanceKmById.get(a.id) ?? null;
  const db = ctx.distanceKmById.get(b.id) ?? null;
  if (da != null && db != null && da !== db) return da - db;
  if (da != null && db == null) return -1;
  if (da == null && db != null) return 1;
  return 0;
}

function canonicalRatingValue(row: StoreDiscoverySortRow): number | null {
  if (row.rating_avg == null || !Number.isFinite(Number(row.rating_avg))) return null;
  return Number(row.rating_avg);
}

function canonicalReviewCount(row: StoreDiscoverySortRow): number {
  const n = row.review_count ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Null ratings sort after rated stores. */
function ratingCmp(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const ra = canonicalRatingValue(a);
  const rb = canonicalRatingValue(b);
  if (ra != null && rb != null && ra !== rb) return rb - ra;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  const rev = canonicalReviewCount(b) - canonicalReviewCount(a);
  if (rev !== 0) return rev;
  return stableSlug(a, b);
}

function reviewsCmp(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const rev = canonicalReviewCount(b) - canonicalReviewCount(a);
  if (rev !== 0) return rev;
  const ra = canonicalRatingValue(a);
  const rb = canonicalRatingValue(b);
  if (ra != null && rb != null && ra !== rb) return rb - ra;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  return stableSlug(a, b);
}

function popularCmp(ctx: StoreDiscoverySortContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  if (ctx.completedOrderCountStatus === "error") return ratingCmp(a, b);
  const map = ctx.completedOrderCount30dById;
  const ac = map?.get(a.id) ?? 0;
  const bc = map?.get(b.id) ?? 0;
  if (ac !== bc) return bc - ac;
  return ratingCmp(a, b);
}

/** Owner-configured prep ASC; UNKNOWN (null/missing) after configured. */
function fastPrepCmp(ctx: StoreDiscoverySortContext, a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const map = ctx.explicitPrepMinutesById;
  const pa = map?.get(a.id) ?? null;
  const pb = map?.get(b.id) ?? null;
  const aKnown = pa != null && Number.isFinite(pa);
  const bKnown = pb != null && Number.isFinite(pb);
  if (aKnown && bKnown && pa !== pb) return pa - pb;
  if (aKnown && !bKnown) return -1;
  if (!aKnown && bKnown) return 1;
  return stableSlug(a, b);
}

export function compareStoreDiscoveryBrowseRows(
  ctx: StoreDiscoverySortContext,
  a: StoreDiscoverySortRow,
  b: StoreDiscoverySortRow
): number {
  const el = eligibilityCmp(ctx, a, b);
  if (el !== 0) return el;

  switch (ctx.sort) {
    case "distance": {
      if (ctx.hasGeo) {
        const oor = outOfRangeCmp(ctx, a, b);
        if (oor !== 0) return oor;
        const dist = distanceCmp(ctx, a, b);
        if (dist !== 0) return dist;
      }
      return stableSlug(a, b);
    }
    case "rating":
      return ratingCmp(a, b);
    case "reviews":
      return reviewsCmp(a, b);
    case "popular":
      return popularCmp(ctx, a, b);
    case "fast":
      return fastPrepCmp(ctx, a, b);
    case "default":
    default:
      return compareStoreDiscoveryRecommendedRows(
        toStoreDiscoveryRecommendedContext({
          district: ctx.district,
          eligibilityRankById: ctx.eligibilityRankById,
          distanceKmById: ctx.distanceKmById,
          outOfRangeById: ctx.outOfRangeById,
          hasGeo: ctx.hasGeo,
          completedOrderCount30dById: ctx.completedOrderCount30dById,
          completedOrderCountStatus: ctx.completedOrderCountStatus ?? "ok",
        }),
        a,
        b
      );
  }
}

export function sortStoreDiscoveryBrowseRows<T extends StoreDiscoverySortRow>(
  rows: T[],
  ctx: StoreDiscoverySortContext
): T[] {
  return [...rows].sort((a, b) => compareStoreDiscoveryBrowseRows(ctx, a, b));
}

export function sortStoreDiscoveryHomeFeedRows<T extends StoreDiscoverySortRow>(
  rows: T[],
  ctx: Omit<StoreDiscoverySortContext, "sort">
): T[] {
  return sortStoreDiscoveryRecommendedRows(
    rows,
    toStoreDiscoveryRecommendedContext({
      ...ctx,
      completedOrderCountStatus: ctx.completedOrderCountStatus ?? "ok",
    })
  );
}

export function resolveStoreBrowseSortedByMeta(
  sort: StoreBrowseServerSortId,
  hasGeo: boolean
):
  | "eligibility_district_distance_orders_rating"
  | "eligibility_distance"
  | "eligibility_rating"
  | "eligibility_reviews"
  | "eligibility_popular"
  | "eligibility_prep" {
  switch (sort) {
    case "distance":
      return "eligibility_distance";
    case "rating":
      return "eligibility_rating";
    case "reviews":
      return "eligibility_reviews";
    case "popular":
      return "eligibility_popular";
    case "fast":
      return "eligibility_prep";
    case "default":
    default:
      return hasGeo
        ? "eligibility_district_distance_orders_rating"
        : "eligibility_district_distance_orders_rating";
  }
}

