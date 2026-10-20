/**
 * 커뮤니티 Admin 목록 API 공용 쿼리 파서 (모임·댓글 관리).
 * 순수 함수 — `q` 검색어 정리·ilike 패턴 이스케이프·limit/offset·상태 화이트리스트.
 */

export const COMMUNITY_LIST_DEFAULT_LIMIT = 50;
export const COMMUNITY_LIST_MAX_LIMIT = 200;
export const COMMUNITY_LIST_MAX_OFFSET = 100_000;
export const COMMUNITY_LIST_SEARCH_MAX_LEN = 80;

/** supabase/migrations/20260327100000_community_engine_v2.sql meetings_status_check */
export const MEETING_STATUSES = ["open", "closed", "ended", "cancelled"] as const;
/** supabase/migrations/20260423090000_meeting_messenger_bridge.sql meetings_platform_approval_status_check */
export const MEETING_APPROVAL_STATUSES = ["pending_approval", "approved", "rejected"] as const;
/** Admin 모임 탭 — status·승인 상태 조합 (서버에서 거른다) */
export const MEETING_ADMIN_TABS = ["pending", "open", "ended", "rejected"] as const;
/** supabase/migrations/20260327100000_community_engine_v2.sql community_comments_status_check */
export const COMMENT_STATUSES = ["active", "hidden", "deleted"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCommunityListUuid(v: string): boolean {
  return UUID_RE.test(v.trim());
}

/** 화이트리스트에 없으면 "" */
export function pickAllowed<T extends string>(raw: string | null | undefined, allowed: readonly T[]): T | "" {
  const v = String(raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : "";
}

function clampInt(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function parseCommunityListPage(
  sp: Pick<URLSearchParams, "get">,
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const maxLimit = opts.maxLimit ?? COMMUNITY_LIST_MAX_LIMIT;
  const defaultLimit = Math.min(opts.defaultLimit ?? COMMUNITY_LIST_DEFAULT_LIMIT, maxLimit);
  return {
    limit: clampInt(sp.get("limit"), defaultLimit, 1, maxLimit),
    offset: clampInt(sp.get("offset"), 0, 0, COMMUNITY_LIST_MAX_OFFSET),
  };
}

/**
 * 검색어 정리 — PostgREST `or()` 문법 문자(`,` `(` `)` `"`)와 `*`(PostgREST like 와일드카드)·제어문자를 공백으로,
 * 공백 정리 후 길이 제한. ilike 와일드카드(% _ \)는 여기서 지우지 않고 `escapeIlikePattern` 으로 이스케이프한다.
 */
export function normalizeCommunitySearchTerm(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f,()"*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COMMUNITY_LIST_SEARCH_MAX_LEN)
    .trim();
}

/** LIKE 이스케이프 — `\` → `\\`, `%` → `\%`, `_` → `\_` (Postgres 기본 escape 문자 `\`) */
export function escapeIlikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 부분 일치 ilike 패턴 (`%term%`, 와일드카드 이스케이프) */
export function ilikeContainsPattern(term: string): string {
  return `%${escapeIlikePattern(term)}%`;
}

export type CommunityListSearch = {
  /** 정리된 검색어 ("" = 검색 없음) */
  term: string;
  /** 검색어가 UUID 면 소문자 UUID (id·post_id·user_id 정확 일치) */
  uuid: string | null;
  /** ilike 패턴 (term 이 없으면 null) */
  pattern: string | null;
};

export function parseCommunityListSearch(raw: string | null | undefined): CommunityListSearch {
  const term = normalizeCommunitySearchTerm(raw);
  if (!term) return { term: "", uuid: null, pattern: null };
  return {
    term,
    uuid: isCommunityListUuid(term) ? term.toLowerCase() : null,
    pattern: ilikeContainsPattern(term),
  };
}

/**
 * PostgREST `or()` 조건 문자열 — 텍스트 ilike · 회원 id IN · UUID 정확 일치를 OR 로 묶는다.
 * 값은 normalizeCommunitySearchTerm 을 거쳐 `,()"` 가 없으므로 따옴표 없이 넣는다.
 */
export function buildCommunitySearchOr(input: {
  search: CommunityListSearch;
  textColumns: string[];
  userColumn: string;
  matchedUserIds: string[];
  uuidColumns: string[];
}): string | null {
  const { search } = input;
  if (!search.term || !search.pattern) return null;
  const parts: string[] = input.textColumns.map((c) => `${c}.ilike.${search.pattern}`);
  const ids = [...new Set(input.matchedUserIds.filter(isCommunityListUuid))];
  if (ids.length) parts.push(`${input.userColumn}.in.(${ids.join(",")})`);
  if (search.uuid) {
    for (const c of input.uuidColumns) parts.push(`${c}.eq.${search.uuid}`);
  }
  return parts.join(",");
}
