/**
 * `/api/posts/[id]/detail` · 상세 하단 추천 API 공통 — 게시글 행 → PostWithMeta
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POST_TRADE_CHAT_ABSOLUTE_MIN_SELECT,
  POST_TRADE_CHAT_BARE_MIN_SELECT,
  POST_TRADE_DETAIL_SELECT,
} from "@/lib/posts/post-query-select";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import type { PostWithMeta } from "@/lib/posts/schema";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

export function mapPostDetailRowToPostWithMeta(row: Record<string, unknown>): PostWithMeta {
  const images = normalizePostImages(row.images);
  const thumbnail_url =
    typeof row.thumbnail_url === "string" && row.thumbnail_url
      ? row.thumbnail_url
      : images?.[0] ?? null;
  const author_id = resolveAuthorIdFromPostRow(row) ?? "";
  const category_id = (row.category_id as string) ?? (row.trade_category_id as string);
  const price = normalizePostPrice(row.price);
  const meta = normalizePostMeta(row.meta);
  const is_free_share = row.is_free_share === true || row.is_free_share === "true";

  return {
    ...row,
    author_id,
    category_id,
    images,
    thumbnail_url,
    price,
    meta: meta ?? undefined,
    is_free_share,
  } as PostWithMeta;
}

export async function loadPostRowForDetail(
  sb: SupabaseClient,
  table: string,
  id: string
): Promise<Record<string, unknown> | null> {
  /** `select('*')` 지양 — 스키마 편차 시 단계적 명시 컬럼 (`post-query-select` 주석과 동일) */
  const tiers = [
    POST_TRADE_DETAIL_SELECT,
    POST_TRADE_CHAT_ABSOLUTE_MIN_SELECT,
    POST_TRADE_CHAT_BARE_MIN_SELECT,
  ];
  for (const sel of tiers) {
    const { data, error } = await sb.from(table).select(sel).eq("id", id).maybeSingle();
    if (!error && data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  }
  return null;
}

export async function loadTradePostForDetailApis(
  readSb: SupabaseClient,
  serviceSb: SupabaseClient | null,
  id: string
): Promise<PostWithMeta | null> {
  const row =
    (await loadPostRowForDetail(readSb, POSTS_TABLE_READ, id)) ??
    (serviceSb && serviceSb !== readSb ? await loadPostRowForDetail(serviceSb, POSTS_TABLE_READ, id) : null) ??
    (serviceSb ? await loadPostRowForDetail(serviceSb, "posts", id) : null);

  if (!row) return null;
  return mapPostDetailRowToPostWithMeta(row);
}
