/**
 * Postgres/Supabase UUID·세션 문자열 비교용 (대소문자·공백 차이로 모임장 불일치 나는 것 방지).
 */
export function normalizeUserIdForCompare(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isSameUserId(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const x = normalizeUserIdForCompare(a);
  const y = normalizeUserIdForCompare(b);
  return x.length > 0 && x === y;
}
