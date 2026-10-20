/**
 * 관리자 화면 조회·저장 실패 → 화면에 넘길 오류 코드 (R6 화면 상태 4종).
 * 서버가 돌려준 `error` 가 코드 형식(snake_case)이 아니면(DB·예외 원문) 대체 코드로 바꾼다 — 원문 노출 금지.
 */

export type AdminLoadFailure = { code: string; httpStatus?: number };

const ADMIN_ERROR_CODE_RE = /^[a-z][a-z0-9_]{1,63}$/;

export function adminSafeErrorCode(raw: unknown, fallback = "load_failed"): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return ADMIN_ERROR_CODE_RE.test(s) ? s : fallback;
}

/** 여러 소스를 함께 불러온 결과 중 첫 실패 (403 이 하나라도 있으면 403 우선). */
export function adminFirstLoadFailure(
  results: ReadonlyArray<{ ok: boolean; error?: string; httpStatus?: number }>
): AdminLoadFailure | null {
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return null;
  const pick = failed.find((r) => r.httpStatus === 403) ?? failed[0];
  return { code: adminSafeErrorCode(pick.error), httpStatus: pick.httpStatus };
}
