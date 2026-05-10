/**
 * 동일 사용자·동일 home-sync URL(정규화 쿼리) 완료 시각 슬라이딩 윈도우 — in-process 전용(개발·단일 워커 진단).
 * @see lib/neighborhood/neighborhood-feed-duplicate-window.ts
 */

const WINDOW_MS = 1500;
const MAX_TIMESTAMPS_PER_KEY = 32;

function sortedSearchString(searchParams: URLSearchParams): string {
  const pairs = [...searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const u = new URLSearchParams();
  for (const [k, v] of pairs) u.append(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** pathname + 정렬된 query — 동일 의미 요청 집계용 */
export function homeSyncRequestDedupeKey(pathname: string, searchParams: URLSearchParams): string {
  return `${pathname}${sortedSearchString(searchParams)}`;
}

const recentEnds = new Map<string, number[]>();

/**
 * 이번 요청 완료 직전에 호출 — 지난 `windowMs` 안에 **이번 포함** 몇 번 완료됐는지 반환.
 */
export function recordHomeSyncCompletion(dedupeKey: string, windowMs = WINDOW_MS): number {
  const now = performance.now();
  let arr = recentEnds.get(dedupeKey);
  if (!arr) {
    arr = [];
    recentEnds.set(dedupeKey, arr);
  }
  const pruned = arr.filter((t) => now - t <= windowMs);
  pruned.push(now);
  const capped = pruned.length > MAX_TIMESTAMPS_PER_KEY ? pruned.slice(-MAX_TIMESTAMPS_PER_KEY) : pruned;
  recentEnds.set(dedupeKey, capped);
  return capped.length;
}
