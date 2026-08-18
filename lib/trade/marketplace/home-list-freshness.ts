/**
 * CUT H — home LIST freshness.
 * Pending N = unique incoming page-1 ids not yet on the applied list. Do not cap N.
 */

export function countPendingNewHomeListings(
  current: ReadonlyArray<{ id?: string | null }>,
  incoming: ReadonlyArray<{ id?: string | null }>
): number {
  const shown = new Set<string>();
  for (const row of current) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id) shown.add(id);
  }
  const pending = new Set<string>();
  for (const row of incoming) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    if (shown.has(id)) continue;
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
