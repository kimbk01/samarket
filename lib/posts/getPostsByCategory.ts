"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";

export type PostSort = "latest" | "popular";

const PAGE_SIZE = 20;

export interface GetPostsByCategoryOptions {
  page?: number;
  sort?: PostSort;
}

export interface GetPostsByCategoryResult {
  posts: PostWithMeta[];
  hasMore: boolean;
}

function mapPostRows(data: unknown[]): PostWithMeta[] {
  return (data as PostWithMeta[]).map((p) => {
    const row = p as unknown as Record<string, unknown>;
    const images = normalizePostImages(row.images);
    const thumbnail_url =
      typeof row.thumbnail_url === "string" && row.thumbnail_url
        ? row.thumbnail_url
        : images?.[0] ?? null;
    const author_id = (row.author_id as string) ?? (row.user_id as string);
    const category_id = (row.category_id as string) ?? (row.trade_category_id as string);
    const price = normalizePostPrice(row.price);
    const meta = normalizePostMeta(row.meta);
    const is_free_share = row.is_free_share === true || row.is_free_share === "true";
    return {
      ...p,
      author_id,
      category_id,
      images,
      thumbnail_url,
      price,
      meta: meta ?? undefined,
      is_free_share,
    } as PostWithMeta;
  });
}

/** trade_category_id / category_id 중 하나로 여러 카테고리 OR 조회 */
export async function getPostsByTradeCategoryIds(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  const supabase = getSupabaseClient();
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))];
  if (!supabase || ids.length === 0) {
    return { posts: [], hasMore: false };
  }

  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const from = (page - 1) * PAGE_SIZE;

  try {
    let q = (supabase as any)
      .from("posts")
      .select("*")
      .neq("status", "hidden")
      .neq("status", "sold")
      .in("trade_category_id", ids);
    if (sort === "latest") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    }
    let { data, error } = await q.range(from, from + PAGE_SIZE - 1);

    if (error && typeof error?.message === "string" && error.message.includes("trade_category_id")) {
      q = (supabase as any)
        .from("posts")
        .select("*")
        .neq("status", "hidden")
        .neq("status", "sold")
        .in("category_id", ids);
      if (sort === "latest") q = q.order("created_at", { ascending: false });
      else q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
      const res = await q.range(from, from + PAGE_SIZE - 1);
      data = res.data;
      error = res.error;
    }

    if (error || !Array.isArray(data)) return { posts: [], hasMore: false };
    const posts = mapPostRows(data);
    return { posts, hasMore: posts.length === PAGE_SIZE };
  } catch {
    return { posts: [], hasMore: false };
  }
}

export async function getPostsByCategory(
  categoryId: string,
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  if (!categoryId?.trim()) return { posts: [], hasMore: false };
  return getPostsByTradeCategoryIds([categoryId.trim()], options);
}
