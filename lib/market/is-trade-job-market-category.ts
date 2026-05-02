import type { CategoryWithSettings } from "@/lib/categories/types";

/**
 * 거래 일자리(알바) 상위 마켓 — URL 필터(jk/je/avail/jr/jc/fs)·부트스트랩 키 정규화에 쓴다.
 */
export function isTradeJobMarketCategory(
  cat: Pick<CategoryWithSettings, "icon_key" | "slug"> | { icon_key?: unknown; slug?: unknown }
): boolean {
  const iconKey = String((cat as { icon_key?: unknown }).icon_key ?? "");
  const slugVal = String((cat as { slug?: unknown }).slug ?? "")
    .trim()
    .toLowerCase();
  return iconKey === "job" || iconKey === "jobs" || slugVal === "job";
}
