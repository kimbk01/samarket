import type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";

export type PhilifeFeedTopicChip = {
  slug: string;
  label: string;
  name_en?: string | null;
  is_feed_sort: boolean;
  sort_slot: "recommend" | "popular" | null;
};

/** 상단 첫 칩: 주제 없음(전역) — 화면 라벨은 `CommunityFeed` 의 `philifeGlobalFeedSortLabel` 만 사용 */
export const PHILIFE_FEED_ALL_TAB_CHIP: PhilifeFeedTopicChip = {
  slug: "",
  label: "",
  is_feed_sort: false,
  sort_slot: null,
};

export function isPhilifeRecommendSortCategory(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return s === "recommend" || s === "recommended";
}

/**
 * `GET /api/philife/neighborhood-topic-options` (또는 RSC 시드) → 피드 2단 탭 칩 목록.
 * `CommunityFeed` 와 동일 규칙(정렬 전용 slug 제외 등).
 */
export function buildFeedChipsFromPhilifeTopicOptionsJson(
  j: PhilifeNeighborhoodTopicOptionsJson
): { chips: PhilifeFeedTopicChip[]; showNeighborOnlyStrip: boolean } {
  const showNeighborOnlyStrip = j?.showNeighborOnlyFilter !== false;
  if (!j?.ok || !Array.isArray(j.feedChips)) {
    return { chips: [PHILIFE_FEED_ALL_TAB_CHIP], showNeighborOnlyStrip };
  }
  const rest: PhilifeFeedTopicChip[] = j.feedChips
    .map((x) => {
      const s = (x.slug ?? "").trim();
      const isFs = x.is_feed_sort === true;
      const sort_slot: "recommend" | "popular" | null =
        x.sort_slot === "recommend" || x.sort_slot === "popular"
          ? x.sort_slot
          : isFs
            ? isPhilifeRecommendSortCategory(s)
              ? "recommend"
              : s.toLowerCase() === "popular"
                ? "popular"
                : null
            : null;
      return {
        slug: x.slug,
        label: x.name,
        name_en: x.name_en ?? null,
        is_feed_sort: isFs,
        sort_slot,
      };
    })
    .filter((chip) => {
      const s = (chip.slug ?? "").trim().toLowerCase();
      if (isPhilifeRecommendSortCategory(s)) return false;
      if (chip.is_feed_sort && chip.sort_slot === "recommend") return false;
      return true;
    });
  const allTab = j.showAllFeedTab !== false;
  const chips = allTab ? [PHILIFE_FEED_ALL_TAB_CHIP, ...rest] : rest;
  return { chips, showNeighborOnlyStrip };
}
