/**
 * 고객 문의 최종 감사 L10 — 고객센터 FAB 숫자 읽기(React 없음 · `use-support-requester-unread` 가 쓴다).
 * 같은 키(사용자 · audience · 매장)는 **진행 중 요청 1개 공유 + 5초 캐시**. `force` = 명시 신호(캐시 건너뜀 · 진행 중 요청이 있으면 그 뒤 1번 더 — 최종 점검 L4).
 * 401 은 `SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED`, 그 밖의 실패는 null(호출 측이 마지막 값 유지).
 */
export const SUPPORT_REQUESTER_UNREAD_CACHE_TTL_MS = 5_000;
export const SUPPORT_REQUESTER_UNREAD_UNAUTHORIZED = -1;

type Entry = {
  at: number;
  value: number | null;
  inflight: Promise<number | null> | null;
  /** 최종 점검 L4: 진행 중 요청이 있을 때 온 강제 다시 읽기 — 그 요청이 끝난 뒤 1번 더(여러 번 와도 1번) */
  queued: Promise<number | null> | null;
};
const entries = new Map<string, Entry>();

export function clearSupportRequesterUnreadCache(key?: string): void {
  if (key == null) entries.clear();
  else entries.delete(key);
}

function startFetch(entry: Entry, qs: string): Promise<number | null> {
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

export function fetchSupportRequesterUnread(key: string, qs: string, force: boolean): Promise<number | null> {
  let e = entries.get(key);
  if (!e) {
    e = { at: 0, value: null, inflight: null, queued: null };
    entries.set(key, e);
  }
  const entry = e;
  if (entry.inflight) {
    if (!force) return entry.inflight;
    // 최종 점검 L4: 강제 신호(새 답변 알림 등)는 진행 중 요청(신호 전에 시작 — 옛 숫자일 수 있음)을 그대로 쓰지 않는다 →
    // 그 요청이 끝나면 1번 더 읽는다. 그사이 온 강제 신호들은 그 1번을 함께 쓴다.
    if (!entry.queued) {
      const prev = entry.inflight;
      const queued: Promise<number | null> = prev
        .catch(() => null)
        .then(() => {
          if (entry.queued === queued) entry.queued = null;
          return startFetch(entry, qs);
        });
      entry.queued = queued;
    }
    return entry.queued;
  }
  if (!force && entry.value != null && Date.now() - entry.at < SUPPORT_REQUESTER_UNREAD_CACHE_TTL_MS) {
    return Promise.resolve(entry.value);
  }
  return startFetch(entry, qs);
}
