"use client";

import type { PostWithMeta } from "./schema";

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
  favoriteMap: Record<string, boolean>;
}

/**
 * 홈/물건 등록 리스트용 게시글 조회 (어드민 posts와 동일 테이블)
 * - status: hidden 제외, sold(거래완료)는 홈 목록 미노출
 */
export async function getPostsForHome(
  options: GetPostsForHomeOptions = {}
): Promise<GetPostsForHomeResult> {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const typeFilter = options.type ?? null;

  try {
    const params = new URLSearchParams({
      page: String(page),
      sort,
    });
    if (typeFilter) {
      params.set("type", typeFilter);
    }

    const res = await fetch(`/api/home/posts?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }

    const data = (await res.json()) as {
      posts?: PostWithMeta[];
      hasMore?: boolean;
      favoriteMap?: Record<string, boolean>;
    };
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      hasMore: data.hasMore === true,
      favoriteMap: data.favoriteMap && typeof data.favoriteMap === "object" ? data.favoriteMap : {},
    };
  } catch {
    return { posts: [], hasMore: false, favoriteMap: {} };
  }
}
