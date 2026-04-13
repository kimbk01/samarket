/**
 * 거래 상세 — 판매자의 다른 글 (서버·Route Handler용)
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

const MAX = 36;

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

export async function fetchPostsByAuthorWithSupabase(
  sb: SupabaseClient,
  authorId: string
): Promise<PostWithMeta[]> {
  const id = authorId?.trim();
  if (!id) return [];

  try {
    const { data, error } = await sb
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_LIST_SELECT)
      .or("status.is.null,status.neq.hidden")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX);

    if (error || !Array.isArray(data)) return [];
    return data.map((p: Record<string, unknown>) => mapRowToPostWithMeta(p));
  } catch {
    return [];
  }
}
