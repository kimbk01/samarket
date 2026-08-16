/**
 * Map resolved TradeFeedLocationConstraint → PostgREST extras (no circular imports).
 */
import {
  buildTradeFeedLocationOrFilter,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

export function tradeFeedLocationToQueryExtras(
  constraint: TradeFeedLocationConstraint
): TradeFeedQueryExtras["tradeFeedLocation"] {
  if (constraint.kind === "all") return undefined;
  if (constraint.kind === "invalid") return { type: "none" };
  const ids = [...new Set(constraint.matchingCanonicalIds)].sort();
  if (constraint.legacyMembers.length === 0) {
    if (ids.length <= 1) {
      return { type: "eq", canonicalId: ids[0] ?? constraint.canonicalId };
    }
    return { type: "in", canonicalIds: ids };
  }
  return { type: "or", orBody: buildTradeFeedLocationOrFilter(constraint) };
}
