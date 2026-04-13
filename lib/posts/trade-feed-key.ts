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

/**
 * 마켓 루트 UUID + 주제 — `/api/trade/feed?tradeMarketParent=…` 와 bootstrap 의 `feedKey` 일치용.
 * (클라이언트가 펼친 id 목록과 서버가 펼친 목록이 어긋나지 않게 함)
 */
export function computeTradeFeedKeyForMarketParent(
  parentCategoryId: string,
  topicRaw: string,
  sort: TradeFeedSort,
  jobsListingKind?: JobListingKindFilter
): string {
  const p = parentCategoryId.trim();
  const t = topicRaw.trim().normalize("NFC");
  return `mp:${p}|t:${t}|${sort}|${jobsListingKind ?? ""}`;
}
