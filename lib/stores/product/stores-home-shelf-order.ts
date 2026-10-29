/**
 * 홈 구성 순서 — 관리자가 편집한 선반 순서와 보존 행(숨은 고정 선반·배너·광고/쿠폰 삽입)의 순서가 겹치면
 * `duplicate_order` 로 저장이 막혔다. 서버가 상대 순서를 유지한 채 0..n-1 로 다시 매긴다.
 * 같은 순서값이면 편집 선반이 앞(운영자가 그 자리를 지정), 보존 행끼리는 기존 순서 유지.
 */
export function renumberHomeCompositionOrders<T extends { slot: string; order: number }>(
  edited: readonly T[],
  preserved: readonly T[]
): T[] {
  const tagged = [
    ...edited.map((row, index) => ({ row, rank: 0, index })),
    ...preserved.map((row, index) => ({ row, rank: 1, index })),
  ];
  tagged.sort((a, b) => a.row.order - b.row.order || a.rank - b.rank || a.index - b.index);
  return tagged.map((t, order) => ({ ...t.row, order }));
}
