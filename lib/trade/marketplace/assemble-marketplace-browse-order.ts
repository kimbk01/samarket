/**
 * CUT-SSOT-4 — browse LIST order assembler (L-SOFT location boost).
 *
 * Nationwide eligible set + within-anchor LGU boost before outside rows.
 * Sort within each block: newest (default) · popular · distance (explicit).
 */
import {
  filterPostsOutsideBrowseAnchor,
  filterPostsWithinBrowseAnchor,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import type { TradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { sortListingsByLguDistance } from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";

export type MarketplaceBrowseSort = "latest" | "popular" | "distance";

export type MarketplaceBrowseListing = {
  id?: string;
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
  created_at?: string;
  view_count?: number | null;
};

function createdAtMs(raw: string | undefined): number {
  return Date.parse(raw ?? "") || 0;
}

/** Sort rows inside one browse location block (within or outside). */
export function sortBrowseListingsWithinLocationBlock<T extends MarketplaceBrowseListing>(
  rows: T[],
  sort: MarketplaceBrowseSort,
  anchorCanonicalId?: string | null
): T[] {
  if (sort === "distance" && anchorCanonicalId?.trim()) {
    return sortListingsByLguDistance(rows, anchorCanonicalId.trim());
  }
  return [...rows].sort((a, b) => {
    if (sort === "popular") {
      const av = Number(a.view_count ?? 0);
      const bv = Number(b.view_count ?? 0);
      if (bv !== av) return bv - av;
    }
    return createdAtMs(b.created_at) - createdAtMs(a.created_at);
  });
}

/** L-SOFT: within anchor block first, then outside — each block sorted independently. */
export function assembleMarketplaceBrowseOrder<T extends MarketplaceBrowseListing>(
  withinRows: T[],
  outsideRows: T[],
  sort: MarketplaceBrowseSort,
  anchorCanonicalId: string
): T[] {
  return [
    ...sortBrowseListingsWithinLocationBlock(withinRows, sort, anchorCanonicalId),
    ...sortBrowseListingsWithinLocationBlock(outsideRows, sort, anchorCanonicalId),
  ];
}

/** Partition a nationwide batch then assemble L-SOFT browse order. */
export function assembleMarketplaceBrowseLocationOrder<T extends MarketplaceBrowseListing>(
  rows: T[],
  withinConstraint: Extract<TradeFeedLocationConstraint, { kind: "lgu" }>,
  sort: MarketplaceBrowseSort = "latest"
): T[] {
  const within = filterPostsWithinBrowseAnchor(rows, withinConstraint);
  const outside = filterPostsOutsideBrowseAnchor(rows, withinConstraint);
  return assembleMarketplaceBrowseOrder(within, outside, sort, withinConstraint.canonicalId);
}
