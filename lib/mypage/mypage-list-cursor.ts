/**
 * 내정보 목록 커서 SSOT (최종 설계 Part C §C.0.2 「커서 형식(신규)」).
 *
 * - 응답 `next_cursor: string | null` = `"<ISO timestamp>|<id>"` (`/api/me/store-orders` 와 같은 형식).
 * - 요청 `?cursor=<값>&limit=<n>` — 기본 20, 최대 50.
 * - 서버 keyset: `(ts, id) < (cursor.ts, cursor.id)` 내림차순.
 *
 * 서버·클라이언트 공용(서버 전용 import 없음).
 */

export const MYPAGE_LIST_PAGE_DEFAULT = 20;
export const MYPAGE_LIST_PAGE_MAX = 50;

export type MypageListCursor = { ts: string; id: string };

/** id 는 uuid·숫자·영문 키만 허용(PostgREST 필터 문자열 주입 차단) */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
/** 타임스탬프는 DB 원문(마이크로초 포함) 그대로 유지 — 문자 집합만 제한 */
const SAFE_TS_RE = /^[0-9T:.+\- Z]{8,40}$/;

/**
 * `?limit=` 해석 — 값이 없으면 `null`(옵트인 API 의 「페이지 모드 아님」 판단용).
 * 숫자가 아니면 기본값, 1 미만은 1, 최대 50.
 */
export function parseMypageListLimit(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return MYPAGE_LIST_PAGE_DEFAULT;
  return Math.min(MYPAGE_LIST_PAGE_MAX, Math.max(1, n));
}

export function encodeMypageListCursor(ts: string | null | undefined, id: string | number | null | undefined): string | null {
  const t = String(ts ?? "").trim();
  const i = String(id ?? "").trim();
  if (!t || !i) return null;
  return `${t}|${i}`;
}

/** 잘못된 커서는 `null` (라우트는 `cursor` 원문이 있는데 `null` 이면 400) */
export function parseMypageListCursor(raw: string | null | undefined): MypageListCursor | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const bar = s.lastIndexOf("|");
  if (bar <= 0 || bar === s.length - 1) return null;
  const ts = s.slice(0, bar).trim();
  const id = s.slice(bar + 1).trim();
  if (!SAFE_ID_RE.test(id) || !SAFE_TS_RE.test(ts)) return null;
  if (!Number.isFinite(Date.parse(ts))) return null;
  return { ts, id };
}

/**
 * PostgREST `.or(...)` keyset 조건 — `ts < c.ts OR (ts = c.ts AND id < c.id)`.
 * 값은 큰따옴표로 감싼다(ISO 의 `:`·`+`·`.` 보호).
 */
export function mypageKeysetOrFilter(cursor: MypageListCursor, tsColumn: string, idColumn = "id"): string {
  const ts = `"${cursor.ts}"`;
  const id = `"${cursor.id}"`;
  return `${tsColumn}.lt.${ts},and(${tsColumn}.eq.${ts},${idColumn}.lt.${id})`;
}

function tsMs(v: string | null | undefined): number {
  const n = Date.parse(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** 내림차순 비교 — a 가 앞이면 음수 */
export function compareKeysetDesc(aTs: string, aId: string, bTs: string, bId: string): number {
  const d = tsMs(bTs) - tsMs(aTs);
  if (d !== 0) return d;
  // 같은 ms — DB 원문(마이크로초) 문자열로 한 번 더
  if (aTs !== bTs) return aTs < bTs ? 1 : -1;
  return aId < bId ? 1 : aId > bId ? -1 : 0;
}

/** 행이 커서보다 뒤(다음 페이지 대상)인가 */
export function isAfterMypageCursor(ts: string, id: string, cursor: MypageListCursor | null): boolean {
  if (!cursor) return true;
  return compareKeysetDesc(ts, id, cursor.ts, cursor.id) > 0;
}

/**
 * 메모리 keyset 페이지 — 이미 읽은 행(여러 출처 병합 등)을 `(ts,id)` 내림차순으로 정렬 후 커서 다음 `limit` 건.
 * `limit+1` 건 이상 남으면 `next_cursor` 를 마지막 항목으로 만든다.
 */
export function paginateMypageRowsDesc<T>(
  rows: readonly T[],
  getTs: (row: T) => string,
  getId: (row: T) => string,
  cursor: MypageListCursor | null,
  limit: number
): { items: T[]; next_cursor: string | null } {
  const sorted = [...rows].sort((a, b) => compareKeysetDesc(getTs(a), getId(a), getTs(b), getId(b)));
  const after = sorted.filter((r) => isAfterMypageCursor(getTs(r), getId(r), cursor));
  const items = after.slice(0, limit);
  const last = items[items.length - 1];
  const next_cursor = after.length > limit && last ? encodeMypageListCursor(getTs(last), getId(last)) : null;
  return { items, next_cursor };
}

/** DB 에서 `limit+1` 건 읽은 결과 → `{ items, next_cursor }` */
export function sliceMypageKeysetPage<T>(
  rows: readonly T[],
  limit: number,
  getTs: (row: T) => string,
  getId: (row: T) => string
): { items: T[]; next_cursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const next_cursor = rows.length > limit && last ? encodeMypageListCursor(getTs(last), getId(last)) : null;
  return { items, next_cursor };
}
