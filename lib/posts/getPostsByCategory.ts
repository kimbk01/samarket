"use client";

import type { PostWithMeta } from "./schema";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";

export type PostSort = "latest" | "popular";

export interface GetPostsByCategoryOptions {
  page?: number;
  sort?: PostSort;
  /** 알바 카테고리 전용: 구인/구직 메타 필터(페이지마다 DB를 여러 번 읽을 수 있음) */
  jobsListingKind?: JobListingKindFilter;
  /**
   * 마켓 루트 UUID — 지정 시 `categoryIds` 대신 서버에서 트리 펼침 (`/api/home/posts` 의 tradeMarketParent 와 동일)
   */
  tradeMarketParent?: string;
  /** `tradeMarketParent` 와 함께: `?topic=` 주제 칩 */
  topic?: string;
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
  const params = new URLSearchParams();
  const parent = options.tradeMarketParent?.trim();
  if (parent) {
    params.set("tradeMarketParent", parent);
    const topic = (options.topic ?? "").trim().normalize("NFC");
    if (topic) params.set("topic", topic);
  } else {
    const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))];
    if (ids.length === 0) return { posts: [], hasMore: false };
    params.set("categoryIds", ids.join(","));
  }
  params.set("page", String(Math.max(1, options.page ?? 1)));
  params.set("sort", options.sort ?? "latest");
  if (options.jobsListingKind === "hire" || options.jobsListingKind === "work") {
    params.set("jk", options.jobsListingKind);
  }

  try {
    const res = await fetch(`/api/trade/feed?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return { posts: [], hasMore: false };
    const data = (await res.json()) as {
      ok?: boolean;
      posts?: PostWithMeta[];
      hasMore?: boolean;
    };
    if (!data.ok) return { posts: [], hasMore: false };
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      hasMore: data.hasMore === true,
    };
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
