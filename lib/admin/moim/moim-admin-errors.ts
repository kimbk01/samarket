/**
 * 모임 어드민 실패 문구 하나 (R5 D §1-1 · D4·D10·D12·D13) — 조치 시트·신고 처리 폼·정책·카테고리·위임 요청 화면이 같이 쓴다.
 * 클라이언트 안전 (서버 모듈 import 없음). 원래 오류 코드는 문장에 넣지 않는다.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { MOIM_ERROR_CODES, MOIM_ROUTE_ERROR_CODES } from "@/lib/moim/moim-error-codes";

const MOIM_CODES: ReadonlySet<string> = new Set<string>([...MOIM_ERROR_CODES, ...MOIM_ROUTE_ERROR_CODES]);

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 실패 결과 → 화면 문장 (`moim_*` 는 그 코드의 문장, 나머지는 어드민 공통 문장) */
export function moimAdminFailureKey(failure: { status: number; code: string }): MessageKey {
  const code = failure.code;
  if (MOIM_CODES.has(code)) return `moim_err_${code}` as MessageKey;
  if (code === "network_error" || failure.status === 0) return "admin_moim_err_network";
  if (code === "invalid_request" || code === "http_400" || failure.status === 400) return "admin_moim_err_invalid_request";
  return "admin_moim_err_generic";
}

export function moimAdminFailureText(t: T, failure: { status: number; code: string }): string {
  return t(moimAdminFailureKey(failure));
}

/** 409 = 다른 관리자가 먼저 바꿈(다시 불러오기) · 404 = 대상 없음(다시 불러오기) · 그 밖 = 시트·폼 유지 */
export function moimAdminFailureKind(failure: { status: number }): "stale" | "gone" | "refused" {
  if (failure.status === 409) return "stale";
  if (failure.status === 404) return "gone";
  return "refused";
}
