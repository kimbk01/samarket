"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

/**
 * 같은 카테고리의 다른 글 (보고 있는 물품과 비슷한 물품)
 * AI 아님. 동일 trade_category_id 기준 최신순 (현재 글 제외)
 */
export async function getSimilarPosts(
  excludePostId: string,
  categoryId: string,
  limit = 6
): Promise<PostWithMeta[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !categoryId?.trim()) return [];

  try {
    const q = (supabase as any)
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_LIST_SELECT)
      .neq("status", "hidden")
      .neq("status", "sold")
      .neq("id", excludePostId)
      .eq("trade_category_id", categoryId.trim())
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data, error } = await q;

    if (error) {
      if (typeof error?.message === "string" && error.message.includes("trade_category_id")) {
        const fallback = await (supabase as any)
          .from(POSTS_TABLE_READ)
          .select(POST_TRADE_LIST_SELECT)
          .neq("status", "hidden")
          .neq("status", "sold")
          .neq("id", excludePostId)
          .eq("category_id", categoryId.trim())
          .order("created_at", { ascending: false })
          .limit(limit);
        if (fallback.error || !Array.isArray(fallback.data)) return [];
        return (fallback.data as Record<string, unknown>[]).map((row) => {
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
      return [];
    }

    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => {
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
  } catch {
    return [];
  }
}
