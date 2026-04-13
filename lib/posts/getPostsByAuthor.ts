"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

const MAX = 20;

function mapRowToPostWithMeta(p: Record<string, unknown>): PostWithMeta {
  const images = normalizePostImages(p.images);
  const thumbnail_url =
    typeof p.thumbnail_url === "string" && p.thumbnail_url
      ? p.thumbnail_url
      : images?.[0] ?? null;
  const price = normalizePostPrice(p.price);
  const meta = normalizePostMeta(p.meta);
  const is_free_share = p.is_free_share === true || p.is_free_share === "true";
  return {
    ...p,
    author_id: (p.author_id as string) ?? (p.user_id as string),
    category_id: (p.category_id as string) ?? (p.trade_category_id as string),
    images,
    thumbnail_url,
    price,
    meta: meta ?? undefined,
    is_free_share,
  } as PostWithMeta;
}

/**
 * 작성자별 게시글 목록 (다른 글 보기)
 */
export async function getPostsByAuthor(authorId: string): Promise<PostWithMeta[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !authorId?.trim()) return [];

  try {
    const base = () =>
      (supabase as any)
        .from("posts")
        .select(POST_TRADE_LIST_SELECT)
        .or("status.is.null,status.neq.hidden")
        .order("created_at", { ascending: false })
        .limit(MAX);
    const { data: byUser, error: eUser } = await base().eq("user_id", authorId);
    if (eUser || !Array.isArray(byUser)) return [];
    return byUser.map((p: Record<string, unknown>) => mapRowToPostWithMeta(p));
  } catch {
    return [];
  }
}
