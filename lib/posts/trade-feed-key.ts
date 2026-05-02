import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";

export type TradeFeedSort = "latest" | "popular" | "pay_desc" | "chat_desc" | "near";

export type TradeFeedKeyExtras = {
  jobEmploymentType?: string;
  todayAvailable?: boolean;
  jobRegionSlug?: string;
  jobIndustrySlug?: string;
};

/** 서버 bootstrap 과 클라이언트 `PostListByCategory` 가 동일한지 판별 */
export function computeTradeFeedKey(
  filterCategoryIds: string[],
  sort: TradeFeedSort,
  jobsListingKind?: JobListingKindFilter,
  extras?: TradeFeedKeyExtras
): string {
  const ids = [...new Set(filterCategoryIds.map((x) => x.trim()).filter(Boolean))].sort();
  const je = extras?.jobEmploymentType?.trim() ?? "";
  const av = extras?.todayAvailable ? "1" : "";
  const jr = extras?.jobRegionSlug?.trim().toLowerCase() ?? "";
  const jc = extras?.jobIndustrySlug?.trim().toLowerCase() ?? "";
  return `${ids.join(",")}|${sort}|${jobsListingKind ?? ""}|je:${je}|av:${av}|jr:${jr}|jc:${jc}`;
}

/**
 * 마켓 루트 UUID + 주제 — `/api/trade/feed?tradeMarketParent=…` 와 bootstrap 의 `feedKey` 일치용.
 * (클라이언트가 펼친 id 목록과 서버가 펼친 목록이 어긋나지 않게 함)
 */
export function computeTradeFeedKeyForMarketParent(
  parentCategoryId: string,
  topicRaw: string,
  sort: TradeFeedSort,
  jobsListingKind?: JobListingKindFilter,
  extras?: TradeFeedKeyExtras
): string {
  const p = parentCategoryId.trim();
  const t = topicRaw.trim().normalize("NFC");
  const je = extras?.jobEmploymentType?.trim() ?? "";
  const av = extras?.todayAvailable ? "1" : "";
  const jr = extras?.jobRegionSlug?.trim().toLowerCase() ?? "";
  const jc = extras?.jobIndustrySlug?.trim().toLowerCase() ?? "";
  return `mp:${p}|t:${t}|${sort}|${jobsListingKind ?? ""}|je:${je}|av:${av}|jr:${jr}|jc:${jc}`;
}
