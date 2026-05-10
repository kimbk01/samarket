/**
 * `tier=critical` home-sync 라우트 벽시계 스냅샷 — 직후 `tier=full` 과의 차이(`full_vs_critical_gap_ms`) 계산용.
 * 메모리: 사용자당 1행, TTL 초과 시 무시.
 */

const TTL_MS = 180_000;

type Row = {
  routeTotalMs: number;
  bundleTotalMs: number | null;
  at: number;
};

const lastByUserId = new Map<string, Row>();

export function recordHomeSyncCriticalRouteSnapshot(
  userId: string,
  routeTotalMs: number,
  bundleTotalMs: number | null
): void {
  lastByUserId.set(userId, {
    routeTotalMs,
    bundleTotalMs,
    at: Date.now(),
  });
}

/** `null` 이면 최근 critical 샘플 없음 또는 TTL 만료 */
export function readHomeSyncFullVsCriticalGapMs(userId: string, currentRouteTotalMs: number): number | null {
  const row = lastByUserId.get(userId);
  if (!row || Date.now() - row.at > TTL_MS) return null;
  return Math.round((currentRouteTotalMs - row.routeTotalMs) * 1000) / 1000;
}
