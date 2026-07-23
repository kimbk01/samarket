/**
 * Domain-neutral latest-row selector (Phase 11B-Fix Hub 권위).
 *
 * invalid/null/empty activity → oldest (never wins Hub).
 * equal activity → roomId (or tie key) deterministic desc.
 */
export function parseActivityMs(at: string | null | undefined): number {
  const raw = typeof at === "string" ? at.trim() : "";
  if (!raw) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

export function compareLatestActivityDesc(input: {
  aAt: string | null | undefined;
  aTieKey: string;
  bAt: string | null | undefined;
  bTieKey: string;
}): number {
  const d = parseActivityMs(input.bAt) - parseActivityMs(input.aAt);
  if (d !== 0) return d;
  return String(input.bTieKey).localeCompare(String(input.aTieKey));
}

export function selectLatestRowByActivityAt<T>(
  rows: ReadonlyArray<T>,
  get: (row: T) => { activityAt: string | null | undefined; tieKey: string }
): T | null {
  if (rows.length === 0) return null;
  let latest = rows[0]!;
  let latestMeta = get(latest);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const meta = get(row);
    // compare(a=latest, b=candidate) > 0 ⇒ candidate sorts before latest (DESC)
    if (
      compareLatestActivityDesc({
        aAt: latestMeta.activityAt,
        aTieKey: latestMeta.tieKey,
        bAt: meta.activityAt,
        bTieKey: meta.tieKey,
      }) > 0
    ) {
      latest = row;
      latestMeta = meta;
    }
  }
  return latest;
}

export function sortRowsByLatestActivityDesc<T>(
  rows: ReadonlyArray<T>,
  get: (row: T) => { activityAt: string | null | undefined; tieKey: string }
): T[] {
  return [...rows].sort((a, b) => {
    const am = get(a);
    const bm = get(b);
    return compareLatestActivityDesc({
      aAt: am.activityAt,
      aTieKey: am.tieKey,
      bAt: bm.activityAt,
      bTieKey: bm.tieKey,
    });
  });
}
