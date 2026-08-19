/**
 * Browse feed SQL location filter vs region+all priority-only (no WHERE).
 */
import {
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

/**
 * Browse feed SQL location filter — disabled for member browse (location = rank signal only).
 * Within/outside assembly uses tradeFeedLocationToQueryExtras on the priority path only.
 */
export function tradeFeedLocationSqlExtras(
  constraint: TradeFeedLocationConstraint
): TradeFeedQueryExtras["tradeFeedLocation"] | undefined {
  void constraint;
  return undefined;
}

/** LIST city anchor: nationwide fetch + near-first concat (not SQL-only LGU dump). */
export function shouldUseRegionAllBrowsePriority(
  lguCityId: string | null | undefined,
  radiusKm: number | null | undefined,
  qAbsent: boolean
): boolean {
  void radiusKm;
  if (!qAbsent || !lguCityId?.trim()) return false;
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
