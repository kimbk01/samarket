import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 홈 상품 정렬 옵션 (28단계: featured = 노출점수순)
 */

export type SortKey = "latest" | "popular" | "nearby" | "featured";

export const SORT_OPTIONS: { key: SortKey; label: string; labelKey: MessageKey }[] = [
  { key: "latest", label: "최신순", labelKey: "common_latest" },
  { key: "popular", label: "인기순", labelKey: "common_popular" },
  { key: "nearby", label: "가까운순", labelKey: "common_nearby" },
  { key: "featured", label: "추천순", labelKey: "common_featured" },
];

/** DB/목록이 아직 지원하는 정렬만 매핑 (나머지는 최신순과 동일) */
export function sortKeyToHomePostSort(key: SortKey): "latest" | "popular" {
  return key === "popular" ? "popular" : "latest";
}
