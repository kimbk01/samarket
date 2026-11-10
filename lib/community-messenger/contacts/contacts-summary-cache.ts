/**
 * 관리(보관함) 「연락처」 줄 요약 보관 — 60초 (연락처 목록 캐시와 같은 간격).
 * `invalidateMessengerContactsCache()` 가 함께 비운다 → 설정을 바꾸면 다음 진입에 새로 받는다.
 */
export type ContactsArchiveSummary = { consented: boolean; hiddenCount: number | null; deviceCount: number | null };

const TTL_MS = 60_000;
let cache: { at: number; value: ContactsArchiveSummary | null } | null = null;

export function readContactsArchiveSummary(): { fresh: boolean; value: ContactsArchiveSummary | null } {
  if (!cache) return { fresh: false, value: null };
  return { fresh: Date.now() - cache.at < TTL_MS, value: cache.value };
}

export function writeContactsArchiveSummary(value: ContactsArchiveSummary | null): void {
  cache = { at: Date.now(), value };
}

export function resetContactsArchiveSummary(): void {
  cache = null;
}
