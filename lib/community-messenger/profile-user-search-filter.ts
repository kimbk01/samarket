/**
 * PostgREST `.or()` ilike 필터 — comma 구분·와일드카드·따옴표 이스케이프.
 * `searchCommunityMessengerUsers` 단일 사용처.
 */
export function normalizeProfileUserSearchKeyword(raw: string): string {
  const trimmed = raw.trim();
  const bare = trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
  return bare.replace(/,/g, "").trim();
}

export function escapeIlikePatternFragment(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function escapePostgrestDoubleQuotedIlike(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** username · nickname · display_name OR ilike — keyword 없으면 null */
export function buildProfileUserSearchOrFilter(rawKeyword: string): string | null {
  const keyword = normalizeProfileUserSearchKeyword(rawKeyword);
  if (!keyword) return null;
  const pat = `%${escapeIlikePatternFragment(keyword)}%`;
  const quoted = escapePostgrestDoubleQuotedIlike(pat);
  return `username.ilike.${quoted},nickname.ilike.${quoted},display_name.ilike.${quoted}`;
}
