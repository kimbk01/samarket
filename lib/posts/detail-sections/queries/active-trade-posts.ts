import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";
import {
  normalizePostImages,
  normalizePostMeta,
  normalizePostPrice,
} from "@/lib/posts/post-normalize";
import type { PostWithMeta } from "@/lib/posts/schema";

/** 목록·추천 공통: 커뮤니티 제외, 숨김·판매완료 제외(유사 추천 기본) */
export function mapTradeRow(p: Record<string, unknown>): PostWithMeta {
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

export function baseTradeListQuery(sb: SupabaseClient, table: string = POSTS_TABLE_READ) {
  return sb
    .from(table)
    .select(POST_TRADE_LIST_SELECT)
    .neq("status", "hidden")
    .neq("type", "community");
}

/** 판매자 다른 물품 — `user_id`·`author_id` 어느 쪽이든 판매자와 일치하면 포함(레거시 행 호환) */
export function sellerListBaseQuery(sb: SupabaseClient, sellerId: string, excludePostId: string) {
  return sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .or("status.is.null,status.neq.hidden")
    .neq("id", excludePostId)
    .or(`user_id.eq.${sellerId},author_id.eq.${sellerId}`)
    .neq("type", "community");
}
