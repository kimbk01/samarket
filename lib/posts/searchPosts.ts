"use client";

import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

export interface SearchPostsOptions {
  categoryId?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;

export async function searchPosts(
  query: string,
  options: SearchPostsOptions = {}
): Promise<PostWithMeta[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const q = query?.trim();
  if (!q) return [];

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, options.limit ?? DEFAULT_LIMIT);
  const from = (page - 1) * limit;

  try {
    let select = (supabase as any)
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_LIST_SELECT)
      .or("status.is.null,status.not.in.(hidden,sold)")
      // 거래·마켓 검색: `type = community` 글은 제외. 레거시 null type 은 유지.
      .or("type.is.null,type.neq.community")
      .ilike("title", `%${q}%`);

    if (options.categoryId?.trim()) {
      select = select.eq("trade_category_id", options.categoryId.trim());
    }

    let { data, error } = await select
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (error && options.categoryId?.trim() && String(error?.message).includes("trade_category_id")) {
      select = (supabase as any)
        .from(POSTS_TABLE_READ)
        .select(POST_TRADE_LIST_SELECT)
        .or("status.is.null,status.not.in.(hidden,sold)")
        .or("type.is.null,type.neq.community")
        .ilike("title", `%${q}%`)
        .eq("category_id", options.categoryId!.trim());
      const res = await select.order("created_at", { ascending: false }).range(from, from + limit - 1);
      data = res.data;
      error = res.error;
    }

    if (error || !Array.isArray(data)) return [];
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
