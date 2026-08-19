/**
 * SEARCH-LOCATION-FRESH-1 — load intent + TOPIC graph + ROOT expanded ids (scoring only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTradeHomeRootCategories } from "@/lib/categories/trade-home-root-query";
import { expandTradeCategoryIdsForRoot } from "@/lib/trade/trade-market-catalog";
import { loadSearchTopicGraphContext } from "@/lib/trade/marketplace/load-search-topic-graph-context";
import {
  emptySearchTopicGraphContext,
  type SearchTopicGraphContext,
} from "@/lib/trade/marketplace/search-topic-graph-context";
import {
  resolveMarketplaceSearchIntent,
  type MarketplaceSearchIntent,
} from "@/lib/trade/marketplace/search-intent-resolver";

export type MarketplaceSearchDiscoveryContext = {
  intent: MarketplaceSearchIntent;
  topicGraph: SearchTopicGraphContext;
  /** parent ROOT id → expanded trade category ids (ranking only). */
  rootExpandedIdsByParent: Record<string, string[]>;
};

export async function loadMarketplaceSearchDiscoveryContext(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  q: string | null | undefined,
  rootParentIds: string[] | null | undefined
): Promise<MarketplaceSearchDiscoveryContext | null> {
  const intentRoots =
    rootParentIds && rootParentIds.length > 0
      ? rootParentIds
      : (await fetchTradeHomeRootCategories(readSb)).map((r) => r.id).filter(Boolean);

  const homeRoots = await fetchTradeHomeRootCategories(readSb);
  const topicGraph =
    (await loadSearchTopicGraphContext(readSb, q, intentRoots)) ??
    emptySearchTopicGraphContext(intentRoots);

  const intent = resolveMarketplaceSearchIntent({ q, homeRoots, topicGraph });
  if (!intent) return null;

  const rootExpandedIdsByParent: Record<string, string[]> = {};
  const expandTargets =
    intent.rootBoostParentIds.length > 0
      ? intent.rootBoostParentIds
      : [];

  for (const parentId of expandTargets) {
    const expanded = await expandTradeCategoryIdsForRoot(readSb, serviceSb, parentId);
    if (expanded.length > 0) rootExpandedIdsByParent[parentId] = expanded;
  }

  return { intent, topicGraph, rootExpandedIdsByParent };
}
