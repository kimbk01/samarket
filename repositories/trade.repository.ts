import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  POST_TRADE_LIST_SELECT,
  mapPostRowsToTradeList,
} from "@/lib/posts/trade-posts-range-query";

const SELLER_ITEMS_POOL = 24;
const SIMILAR_ITEMS_POOL = 80;
const ADS_ITEMS_POOL = 100;

function uniqIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mapRows(rows: unknown[]): PostWithMeta[] {
  return mapPostRowsToTradeList(Array.isArray(rows) ? rows : []);
}

export async function getSellerItemsFromDb(
  sb: SupabaseClient<any>,
  input: {
    sellerId: string;
    excludePostId: string;
    limit: number;
  }
): Promise<PostWithMeta[]> {
  const sellerId = input.sellerId.trim();
  const excludePostId = input.excludePostId.trim();
  if (!sellerId || !excludePostId) return [];

  const { data, error } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .eq("user_id", sellerId)
    .eq("status", "active")
    .neq("id", excludePostId)
    .order("created_at", { ascending: false })
    .limit(Math.min(SELLER_ITEMS_POOL, Math.max(input.limit, 1)));

  if (error || !Array.isArray(data)) return [];
  return mapRows(data).filter((p) => p.type !== "community");
}

export async function getSimilarPoolByCategoryFromDb(
  sb: SupabaseClient<any>,
  input: {
    excludePostId: string;
    categoryId: string | null | undefined;
  }
): Promise<PostWithMeta[]> {
  const excludePostId = input.excludePostId.trim();
  const categoryId = input.categoryId?.trim() ?? "";
  if (!excludePostId) return [];

  const base = sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .eq("status", "active")
    .neq("id", excludePostId)
    .order("created_at", { ascending: false })
    .limit(SIMILAR_ITEMS_POOL);

  const q = categoryId
    ? base.or(`trade_category_id.eq.${categoryId},category_id.eq.${categoryId}`)
    : base;

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  return mapRows(data).filter((p) => p.type !== "community");
}

export async function getRecentTradePoolFromDb(
  sb: SupabaseClient<any>,
  input: {
    excludePostId: string;
  }
): Promise<PostWithMeta[]> {
  const excludePostId = input.excludePostId.trim();
  if (!excludePostId) return [];

  const { data, error } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .eq("status", "active")
    .neq("id", excludePostId)
    .order("created_at", { ascending: false })
    .limit(SIMILAR_ITEMS_POOL);

  if (error || !Array.isArray(data)) return [];
  return mapRows(data).filter((p) => p.type !== "community");
}

type TradeAdCandidateRow = {
  trade_ad_id: string;
  post_id: string;
  priority: number | null;
  ad_product_id: string | null;
};

type TradeAdProductRow = {
  id: string;
  category_id: string | null;
  region_target: string | null;
  placement: string | null;
};

export async function getTradeAdsCandidatesFromDb(
  sb: SupabaseClient<any>,
  input: {
    excludePostId: string;
  }
): Promise<{ posts: PostWithMeta[]; productByPostId: Map<string, TradeAdProductRow | null> }> {
  const excludePostId = input.excludePostId.trim();
  if (!excludePostId) {
    return { posts: [], productByPostId: new Map() };
  }

  const { data: adRows, error: adErr } = await sb
    .from("v_trade_detail_ad_candidates")
    .select("trade_ad_id, post_id, priority, ad_product_id")
    .neq("post_id", excludePostId)
    .order("priority", { ascending: true })
    .limit(ADS_ITEMS_POOL);

  if (adErr || !Array.isArray(adRows) || adRows.length === 0) {
    return { posts: [], productByPostId: new Map() };
  }

  const candidates = adRows as TradeAdCandidateRow[];
  const postIds = uniqIds(candidates.map((r) => String(r.post_id ?? "")));
  if (postIds.length === 0) {
    return { posts: [], productByPostId: new Map() };
  }

  const { data: postRows, error: postErr } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .in("id", postIds)
    .eq("status", "active");
  if (postErr || !Array.isArray(postRows)) {
    return { posts: [], productByPostId: new Map() };
  }

  const adProductIds = uniqIds(candidates.map((r) => String(r.ad_product_id ?? "")));
  const productById = new Map<string, TradeAdProductRow>();
  if (adProductIds.length > 0) {
    const { data: prodRows } = await sb
      .from("ad_products")
      .select("id, category_id, region_target, placement")
      .in("id", adProductIds);
    for (const row of (prodRows ?? []) as TradeAdProductRow[]) {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) continue;
      productById.set(id, row);
    }
  }

  const postById = new Map(
    mapRows(postRows)
      .filter((p) => p.type !== "community")
      .map((p) => [p.id, p] as const)
  );
  const orderedPosts: PostWithMeta[] = [];
  const productByPostId = new Map<string, TradeAdProductRow | null>();
  for (const row of candidates) {
    const postId = String(row.post_id ?? "").trim();
    if (!postId) continue;
    const post = postById.get(postId);
    if (!post) continue;
    orderedPosts.push(post);
    const adProductId = String(row.ad_product_id ?? "").trim();
    productByPostId.set(postId, adProductId ? productById.get(adProductId) ?? null : null);
  }
  return {
    posts: orderedPosts,
    productByPostId,
  };
}
