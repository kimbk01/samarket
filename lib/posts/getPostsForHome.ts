"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import { normalizePostImages, normalizePostPrice, normalizePostMeta } from "./getPostById";

const PAGE_SIZE = 50;

export type HomePostSort = "latest" | "popular";

export interface GetPostsForHomeOptions {
  page?: number;
  sort?: HomePostSort;
  /** 타입 필터. null/미지정 시 전체 등록 상품 조회 */
  type?: "trade" | "community" | "service" | "feature" | null;
}

export interface GetPostsForHomeResult {
  posts: PostWithMeta[];
  hasMore: boolean;
}

/**
 * 홈/물건 등록 리스트용 게시글 조회 (어드민 posts와 동일 테이블)
 * - status: hidden 제외, sold(거래완료)는 홈 목록 미노출
 */
export async function getPostsForHome(
  options: GetPostsForHomeOptions = {}
): Promise<GetPostsForHomeResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { posts: [], hasMore: false };
  }

  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const typeFilter = options.type ?? null;

  try {
    let q = (supabase as any)
      .from("posts")
      .select("*")
      .neq("status", "hidden")
      .neq("status", "sold");

    if (typeFilter) {
      q = q.eq("type", typeFilter);
    }

    if (sort === "latest") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);

    if (error || !Array.isArray(data)) return { posts: [], hasMore: false };
    const posts = (data as PostWithMeta[]).map((p) => {
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
    return { posts, hasMore: posts.length === PAGE_SIZE };
  } catch {
    return { posts: [], hasMore: false };
  }
}
