import type { CommunityFeedSortMode } from "@/lib/community-feed/constants";
import { resolveTopicFeedSortMode } from "@/lib/community-feed/feed-sort-mode";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { isPhilifeNeighborhoodSortSlotSlug } from "@/lib/neighborhood/philife-topic-slug-rules";

export type PhilifeListSortResolved = {
  /** `community_posts` / enum 토픽 slug 필터. `is_feed_sort` 전용(정렬칩) 토픽이면 `null` 을 쓴다(행으로 필터하지 않음). */
  filterCategory: string | null;
  /** 실제 DB·랭킹 정렬 */
  feedSort: CommunityFeedSortMode;
  /** `category` 가 정렬칩(이름/탭) 전용 토픽이었는지(슬롯) */
  isSortOnlyTopicChip: boolean;
};

/**
 * 필라이프 `community_topics` + URL `category` + `sort` 를 합쳐 DB 필터/정렬 모드로.
 * - 일반 토픽: `filterCategory=slug` + `feedSort` 그대로(최신·인기·추천).
 * - sort-only: `is_feed_sort` **그리고** 기존 sort-slot slug contract
 *   (`isPhilifeNeighborhoodSortSlotSlug`: popular / recommend / recommended) 일 때만
 *   토픽 slug 필터를 끄고 정렬만 적용. content slug 재오염 시 topic filter 유지.
 */
export function resolveNeighborhoodListSort(
  categoryRaw: string | null | undefined,
  sortIn: CommunityFeedSortMode,
  topics: CommunityTopicDTO[]
): PhilifeListSortResolved {
  const raw = String(categoryRaw ?? "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { filterCategory: null, feedSort: sortIn, isSortOnlyTopicChip: false };
  }
  const tr = topics.find((t) => t.slug.trim().toLowerCase() === raw);
  if (tr?.is_feed_sort && isPhilifeNeighborhoodSortSlotSlug(tr.slug)) {
    const mode = resolveTopicFeedSortMode(tr);
    if (mode === "popular") {
      return { filterCategory: null, feedSort: "popular", isSortOnlyTopicChip: true };
    }
    if (mode === "recommended") {
      const fs: CommunityFeedSortMode =
        sortIn === "latest" || sortIn === "recommended" ? sortIn : "recommended";
      return { filterCategory: null, feedSort: fs, isSortOnlyTopicChip: true };
    }
  }
  return { filterCategory: raw, feedSort: sortIn, isSortOnlyTopicChip: false };
}
