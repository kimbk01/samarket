/**
 * 거래 마켓 피드 페이지 조회 — 브라우저·Route Handler 공용 ("use client" 없음)
 */
import type { PostWithMeta } from "./schema";
import {
  postMetaMatchesJobListingKind,
  type JobListingKindFilter,
} from "@/lib/jobs/matches-job-listing-kind";
import {
  fetchPostsRangeForTradeCategories,
  MAX_JOB_LISTING_KIND_CHUNKS,
  PAGE_SIZE_TRADE_FEED,
  type TradePostSort,
} from "@/lib/posts/trade-posts-range-query";

export type TradeFeedPageSort = TradePostSort;

export async function fetchTradeFeedPage(
  supabase: unknown,
  categoryIds: string[],
  options: {
    page?: number;
    sort?: TradeFeedPageSort;
    jobsListingKind?: JobListingKindFilter;
  } = {}
): Promise<{ posts: PostWithMeta[]; hasMore: boolean }> {
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))];
  if (!supabase || ids.length === 0) {
    return { posts: [], hasMore: false };
  }

  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const jobKind = options.jobsListingKind;
  const PAGE_SIZE = PAGE_SIZE_TRADE_FEED;

  if (jobKind === "hire" || jobKind === "work") {
    const targetStart = (page - 1) * PAGE_SIZE;
    const targetEnd = targetStart + PAGE_SIZE;
    let matchIndex = 0;
    const out: PostWithMeta[] = [];
    let dbOffset = 0;
    let lastChunkLen = PAGE_SIZE;
    let chunks = 0;

    try {
      while (out.length < PAGE_SIZE && lastChunkLen === PAGE_SIZE && chunks < MAX_JOB_LISTING_KIND_CHUNKS) {
        const chunk = await fetchPostsRangeForTradeCategories(
          supabase,
          ids,
          sort,
          dbOffset,
          dbOffset + PAGE_SIZE - 1
        );
        lastChunkLen = chunk.length;
        chunks++;
        for (const p of chunk) {
          const meta =
            p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
              ? (p.meta as Record<string, unknown>)
              : undefined;
          if (!postMetaMatchesJobListingKind(meta, jobKind)) continue;
          if (matchIndex >= targetStart && matchIndex < targetEnd) {
            out.push(p);
          }
          matchIndex++;
        }
        dbOffset += chunk.length;
        if (chunk.length < PAGE_SIZE) break;
      }
      const hasMore =
        lastChunkLen === PAGE_SIZE && chunks < MAX_JOB_LISTING_KIND_CHUNKS;
      return { posts: out, hasMore };
    } catch {
      return { posts: [], hasMore: false };
    }
  }

  const from = (page - 1) * PAGE_SIZE;

  try {
    const posts = await fetchPostsRangeForTradeCategories(supabase, ids, sort, from, from + PAGE_SIZE - 1);
    return { posts, hasMore: posts.length === PAGE_SIZE };
  } catch {
    return { posts: [], hasMore: false };
  }
}
