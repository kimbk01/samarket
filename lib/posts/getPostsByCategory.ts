"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "./schema";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { fetchTradeFeedPage } from "@/lib/posts/fetch-trade-feed-page";

export type PostSort = "latest" | "popular";

export interface GetPostsByCategoryOptions {
  page?: number;
  sort?: PostSort;
  /** 알바 카테고리 전용: 구인/구직 메타 필터(페이지마다 DB를 여러 번 읽을 수 있음) */
  jobsListingKind?: JobListingKindFilter;
}

export interface GetPostsByCategoryResult {
  posts: PostWithMeta[];
  hasMore: boolean;
}

/** trade_category_id / category_id 중 하나로 여러 카테고리 OR 조회 */
export async function getPostsByTradeCategoryIds(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  const supabase = getSupabaseClient();
  return fetchTradeFeedPage(supabase, categoryIds, options);
}

export async function getPostsByCategory(
  categoryId: string,
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  if (!categoryId?.trim()) return { posts: [], hasMore: false };
  return getPostsByTradeCategoryIds([categoryId.trim()], options);
}
