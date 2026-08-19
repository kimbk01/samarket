/**
 * SEARCH-LOCATION-FRESH-1 — discovery rank (intent + location preference + sort).
 *
 * LOCK-1: search intent = boost only. LOCK-2: location/radius = preference only.
 * LOCK-3: unresolved intent → band D (eligible tail), not empty.
 */
import {
  filterPostsOutsideBrowseAnchor,
  filterPostsWithinBrowseAnchor,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import type { TradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import {
  assembleMarketplaceBrowseOrder,
  sortBrowseListingsWithinLocationBlock,
  type MarketplaceBrowseSort,
} from "@/lib/trade/marketplace/assemble-marketplace-browse-order";
import {
  classifySearchExpansionTier,
  inferBodyTypesFromListings,
  type SearchExpansionListing,
  type SearchExpansionTier,
  type SearchExpansionUserSort,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import type { SearchTopicGraphContext } from "@/lib/trade/marketplace/search-topic-graph-context";
import {
  listingMatchesRootBoost,
  type MarketplaceSearchIntent,
} from "@/lib/trade/marketplace/search-intent-resolver";

export const MARKETPLACE_DISCOVERY_POOL_BATCH = 50;

export type DiscoveryRankListing = SearchExpansionListing & {
  id?: string;
  trade_category_id?: string | null;
  view_count?: number | null;
};

/** Discovery band: 0=ROOT boost, 1–4=CUT C tiers, 5=eligible tail. */
export type MarketplaceDiscoveryBand = 0 | SearchExpansionTier | 5;

function asExpansionListing(row: DiscoveryRankListing): SearchExpansionListing {
  return {
    ...row,
    category_id: row.trade_category_id ?? row.category_id ?? null,
  };
}

function classifyDiscoveryBand(
  listing: DiscoveryRankListing,
  intent: MarketplaceSearchIntent,
  rootExpandedIdsByParent: Record<string, string[]>,
  topicGraph: SearchTopicGraphContext | null | undefined,
  inferredBodyTypes: string[]
): MarketplaceDiscoveryBand {
  const cid = listing.trade_category_id ?? listing.category_id ?? null;
  if (listingMatchesRootBoost(cid, intent.rootBoostParentIds, rootExpandedIdsByParent)) {
    return 0;
  }
  const tier = classifySearchExpansionTier(
    asExpansionListing(listing),
    intent.expansionHints,
    null,
    inferredBodyTypes,
    topicGraph
  );
  return tier ?? 5;
}

function browseSortFromUserSort(userSort: SearchExpansionUserSort): MarketplaceBrowseSort {
  return userSort === "popular" ? "popular" : userSort === "distance" ? "distance" : "latest";
}

function partitionAndSortBlock<T extends DiscoveryRankListing>(
  rows: T[],
  sort: MarketplaceBrowseSort,
  anchorCanonicalId: string | null
): T[] {
  if (!anchorCanonicalId?.trim()) {
    return sortBrowseListingsWithinLocationBlock(rows, sort, null);
  }
  return sortBrowseListingsWithinLocationBlock(rows, sort, anchorCanonicalId.trim());
}

/**
 * Rank one eligible pool batch: intent bands × within/outside anchor × user sort.
 * Does not remove rows — every input row appears in output unless deduped by caller.
 */
export function rankMarketplaceDiscoveryBatch<T extends DiscoveryRankListing>(input: {
  rows: T[];
  intent: MarketplaceSearchIntent;
  rootExpandedIdsByParent: Record<string, string[]>;
  topicGraph?: SearchTopicGraphContext | null;
  feedConstraint: TradeFeedLocationConstraint;
  userSort?: SearchExpansionUserSort;
  inferredBodyTypes?: string[];
}): T[] {
  const userSort = input.userSort ?? "latest";
  const browseSort = browseSortFromUserSort(userSort);
  const topicGraph = input.topicGraph ?? null;
  const inferred = input.inferredBodyTypes ?? inferBodyTypesFromListings(input.rows);

  const buckets: Record<MarketplaceDiscoveryBand, T[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };

  for (const row of input.rows) {
    const band = classifyDiscoveryBand(
      row,
      input.intent,
      input.rootExpandedIdsByParent,
      topicGraph,
      inferred
    );
    buckets[band].push(row);
  }

  const lguConstraint =
    input.feedConstraint.kind === "lgu" ? input.feedConstraint : null;
  const anchorId = lguConstraint?.canonicalId ?? null;

  const order: MarketplaceDiscoveryBand[] = [0, 1, 2, 3, 4, 5];
  const out: T[] = [];

  for (const band of order) {
    const bandRows = buckets[band];
    if (bandRows.length === 0) continue;

    if (!lguConstraint) {
      out.push(...partitionAndSortBlock(bandRows, browseSort, null));
      continue;
    }

    const within = filterPostsWithinBrowseAnchor(bandRows, lguConstraint);
    const outside = filterPostsOutsideBrowseAnchor(bandRows, lguConstraint);
    out.push(
      ...assembleMarketplaceBrowseOrder(within, outside, browseSort, lguConstraint.canonicalId)
    );
  }

  return out;
}
