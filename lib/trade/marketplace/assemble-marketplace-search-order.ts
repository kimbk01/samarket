/**
 * CUT-SSOT-3 — FINAL LIST search order assembler (SIM-BOTH ladder).
 *
 * TARGET ladder (`docs/dibay-marketplace-list-ssot-target.md` §4):
 *   T1 exact phrase
 *   T2 strong related (catalog / TOPIC exact / tokens)
 *   T3 composition proximity
 *   T4 TOPIC sibling graph
 *   T5 same-ROOT tail (T5-B)
 *
 * Within each tier (S-CURRENT + L-SOFT signal):
 *   selected LGU within → outside → newest (or distance when explicit sort)
 */
import {
  assembleSearchExpansionRound,
  classifySearchExpansionTier,
  type SearchExpansionCursor,
  type SearchExpansionHints,
  type SearchExpansionListing,
  type SearchExpansionTier,
  type SearchExpansionUserSort,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import type { SearchTopicGraphContext } from "@/lib/trade/marketplace/search-topic-graph-context";

export type AssembleMarketplaceSearchOrderInput<
  T extends SearchExpansionListing & { id?: string; view_count?: number | null },
> = {
  exactRows: T[];
  relatedInRows: T[];
  relatedOutRows: T[];
  tailRows?: T[];
  hints: SearchExpansionHints;
  browseLguCanonicalId?: string | null;
  userSort?: SearchExpansionUserSort;
  cursor: SearchExpansionCursor;
  topicGraph?: SearchTopicGraphContext | null;
};

/** SIM-BOTH tier labels for diagnostics/tests. */
export const MARKETPLACE_SEARCH_TIER_ORDER: SearchExpansionTier[] = [1, 2, 3, 4, 5];

/**
 * Single SSOT entry for Marketplace text-search ordering.
 * Delegates to expansion round assembly (ranked window slices this output).
 */
export function assembleMarketplaceSearchOrder<
  T extends SearchExpansionListing & { id?: string; view_count?: number | null },
>(input: AssembleMarketplaceSearchOrderInput<T>): { posts: T[]; cursor: SearchExpansionCursor } {
  return assembleSearchExpansionRound(input);
}

export { classifySearchExpansionTier };
