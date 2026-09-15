/**
 * Browse feed SQL location filter vs region+all priority-only (no WHERE).
 *
 * REGION/RANGE (browse-single-contract):
 * - anchor + 전체 (radiusKm==null): L-SOFT nationwide — no SQL location WHERE;
 *   within→outside assembly via tradeFeedLocationToQueryExtras on priority path.
 * - anchor + N km (radiusKm!=null): hard EXCLUDE outside matchingCanonicalIds
 *   (centroid radius LGU set — cross-city inside radius survives).
 * - location=all: no anchor priority (handled by callers without LGU).
 */
import {
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

/**
 * Hard SQL location filter for explicit radius only.
 * Soft L-SOFT (radius null) returns undefined — location is rank/assembly signal only.
 */
export function tradeFeedLocationSqlExtras(
  constraint: TradeFeedLocationConstraint
): TradeFeedQueryExtras["tradeFeedLocation"] | undefined {
  if (constraint.kind !== "lgu") return undefined;
  if (constraint.radiusKm == null) return undefined;
  return tradeFeedLocationToQueryExtras(constraint);
}

/**
 * LIST city + 전체: nationwide fetch + near-first concat (not SQL-only LGU dump).
 * Explicit radius must NOT use this path — hard membership via tradeFeedLocationSqlExtras.
 */
export function shouldUseRegionAllBrowsePriority(
  lguCityId: string | null | undefined,
  radiusKm: number | null | undefined,
  qAbsent: boolean
): boolean {
  if (!qAbsent || !lguCityId?.trim()) return false;
  if (radiusKm != null && Number.isFinite(Number(radiusKm))) return false;
  const constraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  return constraint.kind === "lgu";
}

export function filterPostsOutsideBrowseAnchor<T extends {
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
}>(
  posts: T[],
  withinConstraint: Extract<TradeFeedLocationConstraint, { kind: "lgu" }>
): T[] {
  return posts.filter(
    (p) =>
      !listingMatchesTradeFeedLocation(
        {
          trade_lgu_id: p.trade_lgu_id,
          region: p.region,
          city: p.city,
        },
        withinConstraint
      )
  );
}

export function filterPostsWithinBrowseAnchor<T extends {
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
}>(
  posts: T[],
  withinConstraint: Extract<TradeFeedLocationConstraint, { kind: "lgu" }>
): T[] {
  return posts.filter((p) =>
    listingMatchesTradeFeedLocation(
      {
        trade_lgu_id: p.trade_lgu_id,
        region: p.region,
        city: p.city,
      },
      withinConstraint
    )
  );
}
