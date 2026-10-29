/**
 * C-04 — 메뉴판이 비었을 때 문구 분기.
 * 이전에는 섹션 0개를 「검색 결과가 없습니다」로 표시해 메뉴 0개 매장도 검색 결과 없음으로 보였다.
 * 메뉴 검색어가 있을 때만 「검색 결과 없음」, 그 외에는 「등록된 상품이 없습니다」.
 * (로드 실패는 이 함수 이전에 오류 상태로 분기)
 */
export type StoreMenuBoardEmptyKind = "search_no_results" | "no_items";

export function resolveStoreMenuBoardEmptyKind(input: {
  menuQueryActive: boolean;
}): StoreMenuBoardEmptyKind {
  return input.menuQueryActive ? "search_no_results" : "no_items";
}
