/**
 * PostgREST `.or()` / `.ilike()` 필터 — comma 구분·와일드카드·따옴표 이스케이프.
 * `searchCommunityMessengerUsers` 단일 사용처.
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

/**
 * dibay_id exact match (normalize @, lower).
 * 전환기: 확정 username(`username_confirmed=true`)도 동일 exact 로 매칭.
 */
export function buildProfileUserSearchOrFilter(rawKeyword: string): string | null {
  const keyword = normalizeProfileUserSearchKeyword(rawKeyword);
  if (!keyword) return null;
  const exact = escapePostgrestDoubleQuotedIlike(escapeIlikePatternFragment(keyword));
  return `dibay_id.ilike.${exact},and(username.ilike.${exact},username_confirmed.eq.true)`;
}
