/**
 * PostgREST `.or()` / `.ilike()` 필터 — comma 구분·와일드카드·따옴표 이스케이프.
 * 친구 찾기 판정은 DB `cm_search_members` — 여기는 입력 정리·ilike 이스케이프만 (회원 아이디 v3 재감사 D5).
 */
export function normalizeProfileUserSearchKeyword(raw: string): string {
  const trimmed = raw.trim();
  const bare = trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
  return bare.replace(/,/g, "").trim().toLowerCase();
}

export function escapeIlikePatternFragment(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function escapePostgrestDoubleQuotedIlike(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
