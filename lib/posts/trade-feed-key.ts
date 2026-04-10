import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";

export type TradeFeedSort = "latest" | "popular";

/** 서버 bootstrap 과 클라이언트 `PostListByCategory` 가 동일한지 판별 */
export function computeTradeFeedKey(
  filterCategoryIds: string[],
  sort: TradeFeedSort,
  jobsListingKind?: JobListingKindFilter
): string {
  const ids = [...new Set(filterCategoryIds.map((x) => x.trim()).filter(Boolean))].sort();
  return `${ids.join(",")}|${sort}|${jobsListingKind ?? ""}`;
}
