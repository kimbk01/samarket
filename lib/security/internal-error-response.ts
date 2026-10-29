import { NextResponse } from "next/server";

/**
 * v4 W1 API-10~12 — 내부 오류(DB·Storage·예외 원문)는 서버 로그(console.error)에만 남기고
 * 응답에는 고정 오류 코드만 싣는다. (묶음4 F-09 `store-public-api-error-codes` 와 같은 원칙)
 *
 * - `code`: 화면이 분기할 수 있는 고정 snake_case 코드 (예: `load_failed`, `save_failed`).
 * - `err`: 로그용 원본 (PostgrestError·Error·문자열 모두 허용) — 응답 본문에 포함하지 않는다.
 */
export function internalErrorLogMessage(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    return typeof m === "string" ? m : String(m ?? "");
  }
  return String(err);
}

export function internalErrorResponse(
  code: string,
  logTag: string,
  err: unknown,
  status = 500
): NextResponse {
  console.error(logTag, code, internalErrorLogMessage(err));
  return NextResponse.json({ ok: false, error: code }, { status });
}

/** writer 가 DB·RPC 원문을 `detail` 에 싣는 내부 오류 코드 — 응답에서 detail 제거 대상. */
const INTERNAL_DETAIL_ERROR_CODES = new Set([
  "db_error",
  "rpc_failed",
  "rpc_error",
  "rpc_missing",
  "snapshot_failed",
  "policy_unavailable",
  "inventory_lookup_failed",
  "load_failed",
  "save_failed",
  "query_failed",
]);

/**
 * v4 W1 API-12 — 관리자·오너 쓰기 응답의 `detail`.
 * 5xx 또는 내부 오류 코드면 원문을 서버 로그로만 보내고 `undefined`(응답에서 생략)를 반환한다.
 * 4xx 업무 안내(detail 이 정책 문구인 경우)는 기존대로 유지한다.
 */
export function clientSafeErrorDetail(
  error: string | null | undefined,
  detail: unknown,
  status: number,
  logTag = "[api]"
): string | undefined {
  if (detail == null || detail === "") return undefined;
  const code = String(error ?? "");
  if (status >= 500 || INTERNAL_DETAIL_ERROR_CODES.has(code)) {
    console.error(logTag, code, internalErrorLogMessage(detail));
    return undefined;
  }
  return typeof detail === "string" ? detail : internalErrorLogMessage(detail);
}

const FIXED_ERROR_CODE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * v4 재감사 API-12 — 서비스 결과(`{ error, httpStatus }`)를 그대로 응답할 때 사용.
 * 4xx 와 고정 snake_case 코드(예: `rider_schema_missing_apply_migration`)는 그대로 두고,
 * 5xx 인데 원문(DB·Storage 메시지)이면 서버 로그로만 보내고 `fallbackCode` 로 응답한다.
 */
export function serviceErrorResponse(
  error: string | null | undefined,
  status: number,
  fallbackCode: string,
  logTag: string
): NextResponse {
  const code = String(error ?? "").trim();
  if (status >= 500 && !FIXED_ERROR_CODE_RE.test(code)) {
    return internalErrorResponse(fallbackCode, logTag, code, status);
  }
  return NextResponse.json({ ok: false, error: code || fallbackCode }, { status });
}
