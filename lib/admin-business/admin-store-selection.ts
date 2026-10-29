/**
 * 3-C L-10 — 관리자 매장 목록 선택 (순수 · 클라이언트 안전).
 * 선택 = id 집합 (페이지와 무관 — 페이지를 옮겨도 유지).
 * 「현재 페이지 선택」은 보이는 행 id 만 더하고, 「전체 결과 선택」은 서버가 같은 필터로 확정한 id 목록으로 바꾼다.
 * 필터가 바뀌면 「전체 결과」 표시는 풀리고(scope=manual) id 집합은 그대로 둔다 (운영자가 해제 전까지 유지).
 */
export type AdminStoreSelection = {
  ids: readonly string[];
  scope: "manual" | "all_results";
  /** 전체 결과 선택 시 서버가 알려준 필터 일치 건수 (상한 초과 판정용) */
  allResultsTotal: number | null;
  /** 전체 결과 선택을 만든 필터 키 */
  filterKey: string | null;
};

export const EMPTY_ADMIN_STORE_SELECTION: AdminStoreSelection = {
  ids: [],
  scope: "manual",
  allResultsTotal: null,
  filterKey: null,
};

function uniq(ids: Iterable<string>): string[] {
  return [...new Set([...ids].filter(Boolean))];
}

export function toggleAdminStoreSelection(s: AdminStoreSelection, id: string): AdminStoreSelection {
  const has = s.ids.includes(id);
  return {
    ...s,
    ids: has ? s.ids.filter((x) => x !== id) : uniq([...s.ids, id]),
    scope: "manual",
    allResultsTotal: null,
  };
}

export function isPageFullySelected(s: AdminStoreSelection, pageIds: readonly string[]): boolean {
  return pageIds.length > 0 && pageIds.every((id) => s.ids.includes(id));
}

/** 현재 페이지 전체 선택/해제 토글 — 다른 페이지 선택은 유지. */
export function togglePageAdminStoreSelection(
  s: AdminStoreSelection,
  pageIds: readonly string[]
): AdminStoreSelection {
  if (isPageFullySelected(s, pageIds)) {
    const drop = new Set(pageIds);
    return { ...s, ids: s.ids.filter((x) => !drop.has(x)), scope: "manual", allResultsTotal: null };
  }
  return { ...s, ids: uniq([...s.ids, ...pageIds]), scope: "manual", allResultsTotal: null };
}

export function selectAllResultsAdminStoreSelection(input: {
  ids: readonly string[];
  total: number;
  filterKey: string;
}): AdminStoreSelection {
  return { ids: uniq(input.ids), scope: "all_results", allResultsTotal: input.total, filterKey: input.filterKey };
}

/** 필터가 바뀌면 「전체 결과」 표시만 해제 (id 집합 유지). */
export function onFilterChangeAdminStoreSelection(s: AdminStoreSelection, filterKey: string): AdminStoreSelection {
  if (s.scope === "all_results" && s.filterKey !== filterKey) {
    return { ...s, scope: "manual", allResultsTotal: null, filterKey: null };
  }
  return s;
}

/** 처리 결과 반영 — 성공한 id 는 선택에서 뺀다 (실패만 남겨 재실행 가능). */
export function removeFromAdminStoreSelection(s: AdminStoreSelection, ids: readonly string[]): AdminStoreSelection {
  const drop = new Set(ids);
  return { ...s, ids: s.ids.filter((x) => !drop.has(x)), scope: "manual", allResultsTotal: null };
}
