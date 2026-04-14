/**
 * 거래 상세 — 유사 물품 조회 (서버·Route Handler용, RLS 우회 시 service 클라이언트와 함께 사용)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";
import {
  normalizePostImages,
  normalizePostMeta,
  normalizePostPrice,
} from "@/lib/posts/post-normalize";
import {
  matchRegionGroupOrGlobal,
  matchRegionOrGlobal,
} from "@/services/trade/trade-region.service";

function rowAuthorUserId(row: Record<string, unknown>): string | null {
  const u = row.user_id;
  const a = row.author_id;
  if (typeof u === "string" && u.trim()) return u.trim();
  if (typeof a === "string" && a.trim()) return a.trim();
  return null;
}

function mapRows(data: Record<string, unknown>[]): PostWithMeta[] {
  return data.map((row) => {
    const images = normalizePostImages(row.images);
    const thumbnail_url =
      typeof row.thumbnail_url === "string" && row.thumbnail_url
        ? row.thumbnail_url
        : images?.[0] ?? null;
    const price = normalizePostPrice(row.price);
    const meta = normalizePostMeta(row.meta);
    const is_free_share = row.is_free_share === true || row.is_free_share === "true";
    return {
      ...row,
      author_id: row.author_id ?? row.user_id,
      category_id: row.category_id ?? row.trade_category_id,
      images,
      thumbnail_url,
      price,
      meta: meta ?? undefined,
      is_free_share,
    } as PostWithMeta;
  });
}

function dropCommunityRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((r) => r.type !== "community");
}

function pickOtherSellersFirst(rows: PostWithMeta[], excludeSellerId: string | null, limit: number): PostWithMeta[] {
  if (!excludeSellerId?.trim()) {
    return rows.slice(0, limit);
  }
  const sid = excludeSellerId.trim();
  const others = rows.filter((p) => {
    const raw = p as unknown as Record<string, unknown>;
    return rowAuthorUserId(raw) !== sid;
  });
  if (others.length > 0) return others.slice(0, limit);
  return rows.slice(0, limit);
}

const FETCH_POOL = 48;

export type SimilarPostsQueryOptions = {
  excludeAuthorUserId?: string | null;
  regionId?: string | null;
  regionGroups?: Record<string, string> | null;
};

/**
 * `/api/posts/[id]/detail` 과 동일하게 service/읽기 클라이언트로 조회 — 홈 피드와 노출 정합.
 */
export async function fetchSimilarPostsWithSupabase(
  sb: SupabaseClient,
  excludePostId: string,
  categoryId: string,
  limit: number,
  options?: SimilarPostsQueryOptions
): Promise<PostWithMeta[]> {
  const cid = categoryId.trim();

  const excludeSeller = options?.excludeAuthorUserId?.trim() ?? null;
  const regionId = options?.regionId?.trim() ?? "";

  const base = () =>
    sb
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_LIST_SELECT)
      .neq("status", "hidden")
      .neq("status", "sold")
      .neq("id", excludePostId);

  const run = async (q: ReturnType<typeof base>) => {
    const { data, error } = await q.order("created_at", { ascending: false }).limit(FETCH_POOL);
    if (error || !Array.isArray(data)) return [] as PostWithMeta[];
    const filtered = dropCommunityRows(data as Record<string, unknown>[]);
    return pickOtherSellersFirst(mapRows(filtered), excludeSeller, limit);
  };

  const applyRegionFallback = (rows: PostWithMeta[]): PostWithMeta[] => {
    if (!regionId) return rows.slice(0, limit);
    const tier1 = rows.filter((p) => matchRegionOrGlobal(p.region, regionId));
    if (tier1.length >= limit) return tier1.slice(0, limit);
    const tier2 = rows.filter((p) =>
      matchRegionGroupOrGlobal(p.region, regionId, options?.regionGroups)
    );
    const merged = [...tier1, ...tier2, ...rows];
    const seen = new Set<string>();
    const out: PostWithMeta[] = [];
    for (const row of merged) {
      if (!row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
      if (out.length >= limit) break;
    }
    return out;
  };

  if (cid) {
    const tryOr = await run(
      base().or(`trade_category_id.eq.${cid},category_id.eq.${cid}`)
    );
    if (tryOr.length > 0) return applyRegionFallback(tryOr);

    const tryTrade = await run(base().eq("trade_category_id", cid));
    if (tryTrade.length > 0) return applyRegionFallback(tryTrade);

    const tryCat = await run(base().eq("category_id", cid));
    if (tryCat.length > 0) return applyRegionFallback(tryCat);
  }

  const recent = await run(base());
  return applyRegionFallback(recent);
}
