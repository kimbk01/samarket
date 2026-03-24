/**
 * 홈 상품 정렬 옵션 (28단계: featured = 노출점수순)
 */

export type SortKey = "latest" | "popular" | "nearby" | "featured";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "popular", label: "인기순" },
  { key: "nearby", label: "가까운순" },
  { key: "featured", label: "추천순" },
];

/** DB/목록이 아직 지원하는 정렬만 매핑 (나머지는 최신순과 동일) */
export function sortKeyToHomePostSort(key: SortKey): "latest" | "popular" {
  return key === "popular" ? "popular" : "latest";
}
