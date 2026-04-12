/** PostgREST `.or()` — (created_at,id) 키셋 (통합 채팅 로더와 동일 패턴) */
export function escapePostgrestDoubleQuoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isLikelyIso8601(s: string): boolean {
  if (!s || s.length < 10) return false;
  return Number.isFinite(Date.parse(s));
}

export function keysetBeforeMessagesOrFilter(cursorCreatedAt: string, cursorId: string): string {
  const qTs = escapePostgrestDoubleQuoted(cursorCreatedAt);
  const qId = escapePostgrestDoubleQuoted(cursorId);
  return `created_at.lt.${qTs},and(created_at.eq.${qTs},id.lt.${qId})`;
}
