/**
 * 모임 상세 화면 간 공유 (감사 E2) — 모임 홈·글·일정·쓰기·프로필·알림 설정·운영 화면이 같은 모임 상세를 각자 다시 부르지 않게.
 *
 * - 같은 사람·같은 모임의 상세를 60초 동안 재사용하고, 동시에 부르면 한 번만 부른다(single-flight).
 * - 모임 API 쓰기(GET 이 아닌 요청)가 성공하면 전부 지운다 — 내가 바꾼 내용은 바로 다시 불러 보인다.
 * - 사람(로그인 계정)이 바뀌면 다른 열쇠라 섞이지 않는다. 계정을 모르면 저장하지 않는다. 메모리만 쓴다(앱 재시작 = 비움).
 * - 실패 응답은 저장하지 않는다.
 */

export const MOIM_DETAIL_CACHE_TTL_MS = 60_000;

type Entry<T> = { at: number; value?: T; inflight?: Promise<T> };

const entries = new Map<string, Entry<unknown>>();

function key(viewerId: string | null | undefined, moimId: string): string {
  return `${viewerId ?? "guest"}:${moimId}`;
}

/** 저장된 값(60초 안)이 있으면 그 값, 부르는 중이면 그 약속, 없으면 새로 부른다. `ok:true` 응답만 저장한다 */
export function readMoimDetailCached<T extends { ok: boolean }>(
  viewerId: string | null | undefined,
  moimId: string,
  load: () => Promise<T>,
  opts?: { force?: boolean; now?: number }
): Promise<T> {
  /** 로그인 계정을 아직 모르면 저장하지 않는다 — 계정이 섞이지 않게 (재감사 L3) */
  if (!viewerId) return load();
  const k = key(viewerId, moimId);
  const now = opts?.now ?? Date.now();
  const hit = entries.get(k) as Entry<T> | undefined;
  if (!opts?.force && hit) {
    if (hit.value !== undefined && now - hit.at < MOIM_DETAIL_CACHE_TTL_MS) return Promise.resolve(hit.value);
    if (hit.inflight) return hit.inflight;
  }
  const inflight = load().then(
    (value) => {
      const cur = entries.get(k) as Entry<T> | undefined;
      if (cur?.inflight === inflight) {
        if (value.ok) entries.set(k, { at: Date.now(), value });
        else entries.delete(k);
      }
      return value;
    },
    (err) => {
      if ((entries.get(k) as Entry<T> | undefined)?.inflight === inflight) entries.delete(k);
      throw err;
    }
  );
  entries.set(k, { at: now, inflight });
  return inflight;
}

/** 모임 쓰기 성공 뒤 — 저장된 상세를 모두 지운다 */
export function invalidateMoimDetailCache(): void {
  entries.clear();
}
