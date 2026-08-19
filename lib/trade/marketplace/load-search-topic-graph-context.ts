/**
 * CUT-SSOT-2 — load TOPIC nodes for search graph under trade ROOT ids.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTradeHomeRootCategories } from "@/lib/categories/trade-home-root-query";
import {
  emptySearchTopicGraphContext,
  resolveSearchTopicGraphContext,
  type SearchTopicGraphContext,
  type SearchTopicGraphNode,
} from "@/lib/trade/marketplace/search-topic-graph-context";

function mapTopicRow(row: Record<string, unknown>): SearchTopicGraphNode | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const parent_id = typeof row.parent_id === "string" ? row.parent_id.trim() : "";
  const name = typeof row.name === "string" ? row.name : "";
  const slug = typeof row.slug === "string" ? row.slug : "";
  if (!id || !parent_id || !name || !slug) return null;
  return {
    id,
    parent_id,
    name,
    name_en: typeof row.name_en === "string" ? row.name_en : null,
    slug,
  };
}

export async function loadSearchTopicGraphContext(
  sb: SupabaseClient<any>,
  q: string | null | undefined,
  rootParentIds: string[] | null | undefined
): Promise<SearchTopicGraphContext | null> {
  let roots = (rootParentIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (roots.length === 0) {
    const homeRoots = await fetchTradeHomeRootCategories(sb);
    roots = homeRoots.map((r) => r.id).filter(Boolean);
  }
  if (roots.length === 0) return null;

  const { data, error } = await sb
    .from("categories")
    .select("id, parent_id, name, name_en, slug")
    .eq("type", "trade")
    .eq("is_active", true)
    .in("parent_id", roots);
  if (error || !Array.isArray(data) || data.length === 0) {
    return resolveSearchTopicGraphContext(q, [], roots) ?? emptySearchTopicGraphContext(roots);
  }

  const topicNodes: SearchTopicGraphNode[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const mapped = mapTopicRow(row as Record<string, unknown>);
    if (mapped) topicNodes.push(mapped);
  }

  return resolveSearchTopicGraphContext(q, topicNodes, roots);
}
