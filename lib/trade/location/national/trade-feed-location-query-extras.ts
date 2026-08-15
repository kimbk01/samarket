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
  if (constraint.legacyMembers.length === 0) {
    return { type: "eq", canonicalId: constraint.canonicalId };
  }
  return { type: "or", orBody: buildTradeFeedLocationOrFilter(constraint) };
}
