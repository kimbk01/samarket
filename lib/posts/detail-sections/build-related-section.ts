import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { DetailSectionItem, ListingDetailInput } from "./types";
import { postToDetailItem } from "./detail-item-map";
import { devLogDetailSection } from "./dev-log";
import { baseTradeListQuery, mapTradeRow } from "./queries/active-trade-posts";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { scoreRelatedItem } from "./related/scoring";

const RELATED_MIN = 4;
const RELATED_MAX = 8;
const POOL_CAP = 160;

/** `user_id`만 있던 쿼리는 null user_id 행을 잃어버림 — 매핑 후 판매자 일치로 제거 */
function isListedBySeller(p: PostWithMeta, sellerId: string): boolean {
  if (!sellerId.trim()) return false;
  const uid = String((p as unknown as { user_id?: string }).user_id ?? "").trim();
  const aid = String(p.author_id ?? "").trim();
  return uid === sellerId || aid === sellerId;
}

function filterRelatedPool(posts: PostWithMeta[], anchorId: string, excludeSellerId: string): PostWithMeta[] {
  return posts.filter(
    (p) =>
      p.id !== anchorId &&
      (excludeSellerId.trim() ? !isListedBySeller(p, excludeSellerId) : true)
  );
}

function uniqById(posts: PostWithMeta[]): PostWithMeta[] {
  const seen = new Set<string>();
  const out: PostWithMeta[] = [];
  for (const p of posts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

async function fetchPoolByCategory(
  sb: SupabaseClient,
  categoryId: string,
  excludePostId: string,
  excludeSellerId: string
): Promise<PostWithMeta[]> {
  const { data, error } = await baseTradeListQuery(sb)
    .neq("id", excludePostId)
    .neq("status", "sold")
    .or(`trade_category_id.eq.${categoryId},category_id.eq.${categoryId}`)
    .order("created_at", { ascending: false })
    .limit(POOL_CAP);

  if (error || !Array.isArray(data)) return [];
  const mapped = (data as Record<string, unknown>[]).map(mapTradeRow);
  return filterRelatedPool(mapped, excludePostId, excludeSellerId);
}

async function fetchPoolByRegion(
  sb: SupabaseClient,
  region: string | null,
  excludePostId: string,
  excludeSellerId: string
): Promise<PostWithMeta[]> {
  if (!region?.trim()) return [];
  let q = baseTradeListQuery(sb)
    .neq("id", excludePostId)
    .neq("status", "sold")
    .eq("region", region.trim())
    .order("created_at", { ascending: false })
    .limit(POOL_CAP);
  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  const mapped = (data as Record<string, unknown>[]).map(mapTradeRow);
  return filterRelatedPool(mapped, excludePostId, excludeSellerId);
}

async function fetchPoolRecentTrade(
  sb: SupabaseClient,
  excludePostId: string,
  excludeSellerId: string
): Promise<PostWithMeta[]> {
  const { data, error } = await baseTradeListQuery(sb)
    .neq("id", excludePostId)
    .neq("status", "sold")
    .order("created_at", { ascending: false })
    .limit(POOL_CAP);

  if (error || !Array.isArray(data)) return [];
  const mapped = (data as Record<string, unknown>[]).map(mapTradeRow);
  return filterRelatedPool(mapped, excludePostId, excludeSellerId);
}

function pickByScore(anchor: PostWithMeta, candidates: PostWithMeta[], segment: ListingDetailInput["segment"]): PostWithMeta[] {
  const scored = candidates.map((c) => ({
    p: c,
    score: scoreRelatedItem(anchor, c, segment),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

/**
 * 유사 상품 — 점수 정렬 + 풀 부족 시 카테고리→지역→최신 완화 (최소 RELATED_MIN 건 목표).
 */
export async function buildRelatedSection(
  sb: SupabaseClient,
  input: ListingDetailInput
): Promise<DetailSectionItem[]> {
  const anchor = input.post;
  const sellerId = postAuthorUserId(anchor as unknown as Record<string, unknown>)?.trim() ?? "";
  const cid = (
    anchor.trade_category_id ??
    anchor.category_id ??
    input.category?.id ??
    ""
  )
    .toString()
    .trim();

  try {
    let pool: PostWithMeta[] = [];
    let reason = "no_category_skip_strict_pool";

    if (cid) {
      pool = await fetchPoolByCategory(sb, cid, anchor.id, sellerId);
      reason = "category_pool";
    } else {
      devLogDetailSection("related_items", "no_category_on_post_use_region_recent", {
        hasCategoryLite: Boolean(input.category?.id),
      });
    }

    if (pool.length < RELATED_MIN) {
      const reg = anchor.region ?? null;
      const regional = await fetchPoolByRegion(sb, reg, anchor.id, sellerId);
      pool = uniqById([...pool, ...regional]);
      reason = cid ? "category_plus_region" : "region_only";
    }

    if (pool.length < RELATED_MIN) {
      const recent = await fetchPoolRecentTrade(sb, anchor.id, sellerId);
      pool = uniqById([...pool, ...recent]);
      reason = "with_recent_fallback";
    }

    if (pool.length === 0) {
      devLogDetailSection("related_items", "empty_all_pools");
      return [];
    }

    const sorted = pickByScore(anchor, pool, input.segment);
    const take = sorted.slice(0, Math.max(RELATED_MIN, Math.min(RELATED_MAX, sorted.length)));

    if (take.length < RELATED_MIN) {
      devLogDetailSection("related_items", "below_min_after_slice", { count: take.length, reason });
    }

    return take.slice(0, RELATED_MAX).map((p) => postToDetailItem(p));
  } catch (e) {
    devLogDetailSection("related_items", "exception", { message: String(e) });
    return [];
  }
}
