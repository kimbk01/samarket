/**
 * Browse feed SQL location filter vs region+all priority-only (no WHERE).
 */
import {
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

/** PostgREST location filter — only for anchor + finite radius (hard boundary). */
export function tradeFeedLocationSqlExtras(
  constraint: TradeFeedLocationConstraint
): TradeFeedQueryExtras["tradeFeedLocation"] | undefined {
  if (constraint.kind !== "lgu") {
    return tradeFeedLocationToQueryExtras(constraint);
  }
  if (constraint.radiusKm === null) {
    return undefined;
  }
  return tradeFeedLocationToQueryExtras(constraint);
}

/** LIST region+전체: nationwide fetch + anchor-first concat (not SQL LGU-only). */
export function shouldUseRegionAllBrowsePriority(
  lguCityId: string | null | undefined,
  radiusKm: number | null | undefined,
  qAbsent: boolean
): boolean {
  if (!qAbsent || !lguCityId?.trim()) return false;
  const constraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  return constraint.kind === "lgu" && constraint.radiusKm === null;
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
