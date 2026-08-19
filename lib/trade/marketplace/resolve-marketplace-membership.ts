/**
 * CUT-SSOT-1 — Marketplace LIST membership SSOT (M-HARD).
 *
 * TARGET: `docs/dibay-marketplace-list-ssot-target.md`
 *
 * ROOT/TOPIC selected → HARD `trade_category_id IN` (same ids as trade/feed).
 * Id list authority = `computeMarketFilterIds` (shared with `GET /api/trade/feed`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";

export type MarketplaceRootTopicSelection = {
  parentId: string;
  /** `?topic=` slug or UUID (NFC-normalized) */
  topicParam: string;
};

export type MarketplaceHardMembershipInput = {
  /** Expanded ids for selected ROOT(s) — root + descendant category nodes */
  rootExpandedIds: string[] | null | undefined;
  /** Expanded ids when ?topic= resolved — topic node (+ descendants if any) */
  topicExpandedIds: string[] | null | undefined;
};

/**
 * SQL IN list for posts.trade_category_id when category browse/search/filter applies.
 * `null` = no category hard wall (home ALL / global search without root).
 */
export function resolveHardMembershipCategoryIds(
  input: MarketplaceHardMembershipInput
): string[] | null {
  const topic = input.topicExpandedIds?.filter(Boolean) ?? [];
  if (topic.length > 0) return [...new Set(topic)];
  const root = input.rootExpandedIds?.filter(Boolean) ?? [];
  if (root.length > 0) return [...new Set(root)];
  return null;
}

/** T5-B: tail fetch only when membership scope exists (same ROOT expansion, no global unrelated). */
export function shouldAllowSearchExpansionTail(
  membershipCategoryIds: string[] | null | undefined
): boolean {
  return Boolean(membershipCategoryIds && membershipCategoryIds.length > 0);
}

/** Sync parity with `GET /api/trade/feed` — `computeMarketFilterIds` SSOT. */
export function resolveFeedParityMembershipIds(input: {
  parentCategoryId: string;
  activeChildren: { id: string; slug?: string | null }[];
  topicParam: string;
}): string[] {
  return computeMarketFilterIds(input);
}

/**
 * M-HARD membership ids for one or more market roots (+ optional topic per root).
 * Same expansion as trade feed bootstrap / `GET /api/trade/feed`.
 */
export async function resolveMarketplaceMembershipIdsForRoots(
  qsb: SupabaseClient<any>,
  roots: MarketplaceRootTopicSelection[]
): Promise<string[] | null> {
  if (roots.length === 0) return null;
  const union = new Set<string>();
  for (const { parentId, topicParam } of roots) {
    const pid = parentId.trim();
    if (!pid) continue;
    const children = await fetchTradeCategoryDescendantNodes(qsb, pid);
    for (const id of computeMarketFilterIds({
      parentCategoryId: pid,
      activeChildren: children,
      topicParam: topicParam.trim().normalize("NFC"),
    })) {
      union.add(id);
    }
  }
  return union.size > 0 ? [...union] : null;
}
