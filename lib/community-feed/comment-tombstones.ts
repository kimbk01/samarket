/**
 * 댓글 목록에서 보이는 댓글 + 그 조상 중 삭제·숨김된 댓글(자리만)을 남긴다.
 * 답글이 없는 삭제·숨김 댓글은 목록에서 빠진다. 조상 순환은 방어한다.
 */
export function selectCommentRowsWithTombstones<R extends Record<string, unknown>>(
  allRows: R[],
  isShown: (row: R) => boolean
): { keptRows: R[]; removedIds: Set<string> } {
  const byId = new Map(allRows.map((r) => [String(r.id), r]));
  const keepIds = new Set<string>();
  for (const r of allRows) {
    if (!isShown(r)) continue;
    keepIds.add(String(r.id));
    let parentId = r.parent_id != null ? String(r.parent_id) : "";
    const guard = new Set<string>();
    while (parentId && byId.has(parentId) && !guard.has(parentId)) {
      guard.add(parentId);
      keepIds.add(parentId);
      const parent = byId.get(parentId)!;
      parentId = parent.parent_id != null ? String(parent.parent_id) : "";
    }
  }
  const keptRows = allRows.filter((r) => keepIds.has(String(r.id)));
  const removedIds = new Set(keptRows.filter((r) => !isShown(r)).map((r) => String(r.id)));
  return { keptRows, removedIds };
}
