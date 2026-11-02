/**
 * CUT H — home LIST freshness.
 * Pending N = unique incoming page-1 ids not yet on the applied list. Do not cap N.
 *
 * v5 D1 (Owner 2026-11-03): 작성 시각이 있으면 **화면에 보이는 가장 최근 글보다 늦게 작성된 글만** 센다.
 * 판매완료·삭제·숨김으로 1쪽이 밀려 올라온 기존 글은 새 매물이 아니다(CUT H DO NOT 「dropped sold/hidden rows」).
 * 홍보 고정 글(`excludeFromBaseline`)은 기준 시각 계산에서 뺀다 — 오래된 고정 글이 위에 있어도 기준이 흔들리지 않게.
 * 작성 시각이 없는 행은 예전처럼 id 만으로 센다.
 */
type FreshnessRow = { id?: string | null; created_at?: string | null };

function createdMs(row: FreshnessRow): number | null {
  const ms = typeof row.created_at === "string" ? Date.parse(row.created_at) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

export function countPendingNewHomeListings<T extends FreshnessRow>(
  current: ReadonlyArray<T>,
  incoming: ReadonlyArray<T>,
  excludeFromBaseline?: (row: T) => boolean
): number {
  const shown = new Set<string>();
  let newestShownMs: number | null = null;
  for (const row of current) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id) shown.add(id);
    if (excludeFromBaseline?.(row)) continue;
    const ms = createdMs(row);
    if (ms != null && (newestShownMs == null || ms > newestShownMs)) newestShownMs = ms;
  }
  const pending = new Set<string>();
  for (const row of incoming) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    if (shown.has(id)) continue;
    const ms = createdMs(row);
    if (newestShownMs != null && ms != null && ms <= newestShownMs) continue;
    pending.add(id);
  }
  return pending.size;
}

/** Same-id field updates only — no insert, delete, or reorder. */
export function patchHomeTradePostsInPlace<T extends { id: string }>(
  prev: readonly T[],
  incoming: readonly T[],
  isSameRow: (a: T, b: T) => boolean
): T[] {
  if (prev.length === 0) return prev as T[];
  const incomingById = new Map(incoming.map((row) => [row.id, row]));
  let changed = false;
  const out = prev.map((row) => {
    const next = incomingById.get(row.id);
    if (!next || isSameRow(row, next)) return row;
    changed = true;
    return next;
  });
  return changed ? out : (prev as T[]);
}
