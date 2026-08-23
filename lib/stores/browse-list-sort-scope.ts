/** Browse 목록 정렬 reset 범위 — 업종·서브탭 전환 (마운트 직후 deep link sort 유지) */
export function browseListSortScopeKey(primarySlug: string, activeSub: string): string {
  return `${primarySlug}|${activeSub}`;
}

/** scope가 실제로 바뀐 경우만 default 정렬로 복귀 (동일 scope = 마운트·리렌더) */
export function shouldResetBrowseListSortOnScopeChange(prevKey: string, nextKey: string): boolean {
  return prevKey !== nextKey;
}
