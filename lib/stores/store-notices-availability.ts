/**
 * OPS-01 — `public.store_notices` 테이블 부재(마이그레이션 미적용)를 「빈 목록 성공」으로 위장하지 않는다.
 * 오너·공개 API 모두 503 `store_notices_unavailable` 로 응답한다.
 */
export const STORE_NOTICES_UNAVAILABLE_ERROR = "store_notices_unavailable";

/** PostgREST PGRST205(스키마 캐시에 테이블 없음) / Postgres 42P01(undefined_table) / 메시지 패턴 */
export function isStoreNoticesTableMissingError(
  err: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").trim();
  if (code === "PGRST205" || code === "42P01") return true;
  const msg = String(err.message ?? "");
  return /store_notices/i.test(msg) && /does not exist|schema cache|could not find the table/i.test(msg);
}

export function storeNoticesUnavailableBody() {
  return { ok: false as const, error: STORE_NOTICES_UNAVAILABLE_ERROR };
}
