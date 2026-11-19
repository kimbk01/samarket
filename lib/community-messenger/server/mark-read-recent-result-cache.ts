/**
 * PATCH mark_read 직후 짧은 재사용 캐시 (같은 user·room·커서 연타 → 같은 응답).
 *
 * 2026-11-19 재감사 결함 2-1: 예전 Map 은 만료 시각만 있고 지우지 않아, 읽음마다 항목(배지 응답 포함)이
 * 인스턴스 수명 동안 쌓였다. 여기서는 넣을 때 만료 항목을 지우고, 상한을 넘으면 오래된 것부터 지운다.
 */
export const MARK_READ_RECENT_RESULT_MAX_ENTRIES = 500;

export type MarkReadRecentResultCache<T> = {
  get(key: string, now?: number): T | null;
  set(key: string, value: T, ttlMs: number, now?: number): void;
  size(): number;
};

export function createMarkReadRecentResultCache<T>(
  maxEntries: number = MARK_READ_RECENT_RESULT_MAX_ENTRIES
): MarkReadRecentResultCache<T> {
  const map = new Map<string, { expiresAt: number; value: T }>();

  const sweepExpired = (now: number) => {
    for (const [k, v] of map) {
      if (v.expiresAt <= now) map.delete(k);
    }
  };

  return {
    get(key, now = Date.now()) {
      const hit = map.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= now) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value, ttlMs, now = Date.now()) {
      sweepExpired(now);
      map.delete(key);
      map.set(key, { expiresAt: now + ttlMs, value });
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    size() {
      return map.size;
    },
  };
}

/**
 * 결함 2-2: 홈 목록·탭 목록·「모두 읽음」 호출은 응답의 badgeAck 를 쓰지 않는다.
 * 그 호출만 `skipBadgeAck: true` 를 보내고, 서버는 배지 전체 재계산을 건너뛴다.
 * 플래그가 없으면(방 열기·구 클라이언트) 예전과 같이 계산한다.
 */
export function markReadRequestWantsBadgeAck(body: unknown): boolean {
  if (!body || typeof body !== "object") return true;
  return (body as { skipBadgeAck?: unknown }).skipBadgeAck !== true;
}
