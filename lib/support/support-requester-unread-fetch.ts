/**
 * 고객 문의 최종 감사 L10 — 고객센터 FAB 숫자 읽기(React 없음 · `use-support-requester-unread` 가 쓴다).
 * 같은 키(사용자 · audience · 매장)는 **진행 중 요청 1개 공유 + 5초 캐시**. `force` = 명시 신호(캐시 건너뜀, 진행 중 요청은 공유).
 * 401 은 `SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED`, 그 밖의 실패는 null(호출 측이 마지막 값 유지).
 */
export const SUPPORT_REQUESTER_UNREAD_CACHE_TTL_MS = 5_000;
export const SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED = -1;

type Entry = { at: number; value: number | null; inflight: Promise<number | null> | null };
const entries = new Map<string, Entry>();

export function clearSupportRequesterUnreadCache(key?: string): void {
  if (key == null) entries.clear();
  else entries.delete(key);
}

export function fetchSupportRequesterUnread(key: string, qs: string, force: boolean): Promise<number | null> {
  let e = entries.get(key);
  if (!e) {
    e = { at: 0, value: null, inflight: null };
    entries.set(key, e);
  }
  if (e.inflight) return e.inflight;
  if (!force && e.value != null && Date.now() - e.at < SUPPORT_REQUESTER_UNREAD_CACHE_TTL_MS) {
    return Promise.resolve(e.value);
  }
  const entry = e;
  const token: { run: Promise<number | null> | null } = { run: null };
  const run: Promise<number | null> = (async (): Promise<number | null> => {
    await null; // 아래 finally 가 항상 `entry.inflight = run` 뒤에 돌게
    try {
      const res = await fetch(`/api/support/cases?${qs}`, { credentials: "include", cache: "no-store" });
      if (res.status === 401) return SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED;
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; unread?: unknown };
      if (!res.ok || !json.ok) return null;
      const n = Math.max(0, Math.floor(Number(json.unread) || 0));
      entry.value = n;
      entry.at = Date.now();
      return n;
    } catch {
      return null;
    } finally {
      if (entry.inflight === token.run) entry.inflight = null;
    }
  })();
  token.run = run;
  entry.inflight = run;
  return run;
}
