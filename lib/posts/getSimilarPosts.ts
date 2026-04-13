"use client";

import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

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

function baseQuery(supabase: ReturnType<typeof getSupabaseClient>, excludePostId: string) {
  return (supabase as any)
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .neq("status", "hidden")
    .neq("status", "sold")
    .neq("id", excludePostId);
}

/**
 * 같은 카테고리의 다른 글 — `trade_category_id` / `category_id` 레거시 혼용 대응
 */
export async function getSimilarPosts(
  excludePostId: string,
  categoryId: string,
  limit = 6
): Promise<PostWithMeta[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !categoryId?.trim()) return [];

  const cid = categoryId.trim();

  try {
    const tryOr = await baseQuery(supabase, excludePostId)
      .or(`trade_category_id.eq.${cid},category_id.eq.${cid}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!tryOr.error && Array.isArray(tryOr.data) && tryOr.data.length > 0) {
      return mapRows(tryOr.data as Record<string, unknown>[]);
    }

    const tryTrade = await baseQuery(supabase, excludePostId)
      .eq("trade_category_id", cid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!tryTrade.error && Array.isArray(tryTrade.data) && tryTrade.data.length > 0) {
      return mapRows(tryTrade.data as Record<string, unknown>[]);
    }

    const tryCat = await baseQuery(supabase, excludePostId)
      .eq("category_id", cid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!tryCat.error && Array.isArray(tryCat.data)) {
      return mapRows(tryCat.data as Record<string, unknown>[]);
    }

    return [];
  } catch {
    return [];
  }
}
