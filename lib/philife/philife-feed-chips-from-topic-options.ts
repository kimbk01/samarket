import type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";

export type PhilifeFeedTopicChip = {
  slug: string;
  label: string;
  name_en?: string | null;
  is_feed_sort: boolean;
  sort_slot: "recommend" | "popular" | null;
};

/**
 * @deprecated Home is composition SSOT (`composeCommunityNavItems`), not an All topic chip.
 */
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
 * Content topic chips for Community Navigation composition (Admin topics only).
 * Home / Local / Popular are composed separately — not prepended here.
 */
export function buildFeedChipsFromPhilifeTopicOptionsJson(
  j: PhilifeNeighborhoodTopicOptionsJson
): { chips: PhilifeFeedTopicChip[]; showNeighborOnlyStrip: boolean } {
  const showNeighborOnlyStrip = j?.showNeighborOnlyFilter !== false;
  if (!j?.ok || !Array.isArray(j.feedChips)) {
    return { chips: [], showNeighborOnlyStrip };
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
      if (!s) return false;
      if (isPhilifeRecommendSortCategory(s)) return false;
      if (s === "popular" || s === "latest" || s === "home" || s === "local") return false;
      if (chip.is_feed_sort === true) return false;
      if (chip.sort_slot != null) return false;
      return true;
    });
  void j.showAllFeedTab;
  return { chips: rest, showNeighborOnlyStrip };
}
