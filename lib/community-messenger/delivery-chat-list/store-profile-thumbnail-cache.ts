/**
 * 주문 채팅 목록 — 매장 프로필 URL 캐시(탭 세션·행 재마운트).
 *
 * 2026-11-19 (운영 실측: 한산한 2시간 310회 · 회당 Supabase 2) — 결함 수정:
 *  ① 사진 없는 매장은 기억하지 않아 행이 다시 그려질 때마다 API 를 다시 불렀다 → 「사진 없음」도 10분 기억.
 *  ② 같은 매장 동시 요청(행 미리 받기 + 썸네일 마운트)이 각각 나갔다 → 진행 중 요청 1개로 합침.
 * 사진이 있는 매장은 이전처럼 탭 세션 동안 기억(220개 상한). 사진 로드 실패 시 강제 재조회(`force`)는 그대로.
 */

const MAX_ENTRIES = 220;
export const STORE_PROFILE_THUMB_NONE_TTL_MS = 10 * 60 * 1000;

/** url = 사진 주소, null = 사진 없음(noneUntil 까지 유효) */
type Entry = { url: string | null; noneUntil: number };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();

function touch(k: string, e: Entry): void {
  if (store.has(k)) store.delete(k);
  store.set(k, e);
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value as string | undefined;
    if (first) store.delete(first);
    else break;
  }
}

export function readStoreProfileThumbnailCache(storeId: string): string | null {
  const k = storeId.trim();
  if (!k) return null;
  const e = store.get(k);
  if (!e || !e.url) return null;
  touch(k, e);
  return e.url;
}

/** 사진 주소든 「사진 없음」이든 아직 유효한 기억이 있으면 true — 다시 조회하지 않는다 */
export function hasFreshStoreProfileThumbnailEntry(storeId: string, nowMs: number = Date.now()): boolean {
  const k = storeId.trim();
  if (!k) return false;
  const e = store.get(k);
  if (!e) return false;
  if (e.url) return true;
  if (e.noneUntil > nowMs) return true;
  store.delete(k);
  return false;
}

export function writeStoreProfileThumbnailCache(storeId: string, url: string): void {
  const k = storeId.trim();
  const u = url.trim();
  if (!k || !u) return;
  touch(k, { url: u, noneUntil: 0 });
}

export function writeStoreProfileThumbnailNone(storeId: string, nowMs: number = Date.now()): void {
  const k = storeId.trim();
  if (!k) return;
  touch(k, { url: null, noneUntil: nowMs + STORE_PROFILE_THUMB_NONE_TTL_MS });
}

/**
 * 매장 프로필 주소 1회 조회(같은 매장 진행 중이면 그 결과를 같이 기다림).
 * 기억이 유효하면 요청하지 않는다(`force` 제외). 실패(네트워크·권한)는 기억하지 않는다.
 */
export function fetchStoreProfileThumbnailOnce(
  storeId: string,
  opts?: { force?: boolean; fetchImpl?: typeof fetch }
): Promise<string | null> {
  const k = storeId.trim();
  if (!k) return Promise.resolve(null);
  if (!opts?.force && hasFreshStoreProfileThumbnailEntry(k)) return Promise.resolve(readStoreProfileThumbnailCache(k));
  const running = inflight.get(k);
  if (running) return running;
  const f = opts?.fetchImpl ?? fetch;
  const p = (async () => {
    try {
      const res = await f(`/api/community-messenger/store-profile-thumbnail?storeId=${encodeURIComponent(k)}`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
      if (!res.ok || !j.ok) return null;
      const u = typeof j.url === "string" && j.url.trim() ? j.url.trim() : null;
      if (u) writeStoreProfileThumbnailCache(k, u);
      else writeStoreProfileThumbnailNone(k);
      return u;
    } catch {
      return null;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, p);
  return p;
}

export function prefetchStoreProfileThumbnailIfNeeded(storeId: string | null | undefined): void {
  const k = typeof storeId === "string" ? storeId.trim() : "";
  if (!k || hasFreshStoreProfileThumbnailEntry(k)) return;
  void fetchStoreProfileThumbnailOnce(k);
}

/** 테스트 전용 */
export function __resetStoreProfileThumbnailCacheForTests(): void {
  store.clear();
  inflight.clear();
}
