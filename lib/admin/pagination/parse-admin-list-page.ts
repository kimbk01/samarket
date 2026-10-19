/**
 * Admin 목록 API 공용 페이지 파라미터 파서 (server-side pagination).
 *
 * - `limit`: 기본 `defaultLimit`(50), 1..`maxLimit`(200) 로 고정.
 * - `offset`: 기본 0, 음수·NaN 은 0.
 * - 응답 계약: `{ total, limit, offset }` 를 같이 돌려 UI 가 정확한 페이지 수를 그린다.
 */

export type AdminListPage = {
  limit: number;
  offset: number;
};

export type ParseAdminListPageOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export const ADMIN_LIST_DEFAULT_LIMIT = 50;
export const ADMIN_LIST_MAX_LIMIT = 200;
/** 매우 큰 offset 으로 DB 를 긁는 요청 방지. */
export const ADMIN_LIST_MAX_OFFSET = 100_000;

type ParamSource = { get(name: string): string | null } | Record<string, string | null | undefined>;

function readParam(sp: ParamSource, key: string): string | null {
  if (typeof (sp as { get?: unknown }).get === "function") {
    return (sp as { get(name: string): string | null }).get(key);
  }
  const v = (sp as Record<string, string | null | undefined>)[key];
  return v == null ? null : String(v);
}

function toInt(raw: string | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseAdminListPage(sp: ParamSource, opts: ParseAdminListPageOptions = {}): AdminListPage {
  const maxLimit = Math.max(1, opts.maxLimit ?? ADMIN_LIST_MAX_LIMIT);
  const defaultLimit = Math.min(Math.max(1, opts.defaultLimit ?? ADMIN_LIST_DEFAULT_LIMIT), maxLimit);
  const rawLimit = toInt(readParam(sp, "limit"));
  const limit = rawLimit == null || rawLimit < 1 ? defaultLimit : Math.min(rawLimit, maxLimit);
  const rawOffset = toInt(readParam(sp, "offset"));
  const offset = rawOffset == null || rawOffset < 0 ? 0 : Math.min(rawOffset, ADMIN_LIST_MAX_OFFSET);
  return { limit, offset };
}

/** PostgREST `.range(from, to)` 인자 (to 포함). */
export function adminListRange(page: AdminListPage): [number, number] {
  return [page.offset, page.offset + page.limit - 1];
}

/**
 * 검색어 정리 — PostgREST `or()` 식을 깨는 문자(`,()*"\`) 제거, 공백 정리, 최대 60자.
 * 빈 문자열이면 검색 없음.
 */
export function sanitizeAdminListSearch(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[,()*"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** ILIKE 패턴 조각 이스케이프 (`%`, `_`, `\`) — 사용자가 입력한 와일드카드를 리터럴로. */
export function escapeAdminIlike(fragment: string): string {
  return fragment.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 1-based page ↔ offset 변환 (UI 쪽). */
export function adminListOffsetForPage(page: number, pageSize: number): number {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return (p - 1) * Math.max(1, pageSize);
}

export function adminListPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/** PostgREST `.or()` 안의 값 — 큰따옴표로 감싸고 `\`·`"` 이스케이프. */
export function quotePostgrestOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isAdminListUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
