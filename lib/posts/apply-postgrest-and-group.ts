/**
 * PostgREST `and=(or(…),or(…))` 형태 — Supabase `.filter("and", …)` 는
 * `(column, operator, value)` 3인자 시그니처라 2인자 호출 시 `undefined` 가 붙어 쿼리가 깨짐.
 */
export function applyPostgrestAndGroup(
  query: { url: URL },
  andGroup: string
): void {
  const t = andGroup.trim();
  if (!t) return;
  query.url.searchParams.set("and", t);
}
