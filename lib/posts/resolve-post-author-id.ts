/**
 * posts 행/객체에서 작성자 식별자 — `author_id`가 비어 있으면 `user_id`.
 * `??` 만으로는 빈 문자열이 `user_id`를 가리지 않아 목록에서 판매자 줄이 비는 경우가 있음.
 */
export function resolveAuthorIdFromPostRow(row: Record<string, unknown>): string | undefined {
  for (const key of ["author_id", "user_id"] as const) {
    const raw = row[key];
    if (raw == null) continue;
    const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
    if (s) return s;
  }
  return undefined;
}
