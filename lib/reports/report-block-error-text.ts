/**
 * 신고·차단 오류 코드 → 화면 문구 (재감사 2026-11-27 · `lib/i18n/api-error-text.ts`).
 * - 서버(`/api/community/reports`·`/api/reports`·`/api/chat/rooms/:id/block`·`/api/community/block-relations`)는 코드만 보낸다.
 * - 클라이언트 함수(`createReport`·`submitReport`·`requestUserBlock` 등)는 문장 대신 `ReportClientFailure`(코드·상태)를 돌려준다.
 * - 서버가 문장을 보내도(코드 모양이 아니면) 화면에는 나가지 않는다 — 상태 번호·기본 문구로 그린다.
 */
import {
  pickApiErrorCode,
  pickApiErrorParams,
  resolveApiErrorText,
  type ApiErrorCodeMap,
  type ApiErrorTranslate,
} from "@/lib/i18n/api-error-text";
import type { MessageKey } from "@/lib/i18n/messages";

export type ReportClientFailure = {
  ok: false;
  /** snake_case 오류 코드 — 서버가 코드를 주지 않았으면 null(상태 번호·기본 문구로 그림) */
  code: string | null;
  status: number | null;
  params?: Record<string, string | number>;
};

/** 커뮤니티 글·댓글 신고 + 통합 신고 */
export const REPORT_ERROR_KEYS: ApiErrorCodeMap = {
  login_required: "common_login_required",
  network_error: "common_network_error",
  report_reason_required: "cm_ui_report_reason_prompt",
  post_not_found: "community_err_post_not_found",
  comment_not_found: "community_err_comment_not_found",
  ad_not_found: "report_err_ad_not_found",
  self_report_post: "community_report_err_self_post",
  self_report_comment: "community_report_err_self_comment",
  already_reported_post: "ui_post_report_already_title",
  already_reported_comment: "community_report_err_already_comment",
  report_failed: "ui_report_failed",
};

/** 사용자 차단 (`requestUserBlock` · 채팅방 차단) */
export const USER_BLOCK_ERROR_KEYS: ApiErrorCodeMap = {
  login_required: "common_login_required",
  network_error: "common_network_error",
  self_block: "report_err_block_self",
  bad_target: "report_err_block_failed",
  block_failed: "report_err_block_failed",
  peer_not_found: "report_err_block_failed",
  room_not_found: "report_err_room_not_found",
};

/** 실패 응답 → 코드·상태 (문장은 버린다) */
export function reportClientFailureFromResponse(status: number | null, json: unknown): ReportClientFailure {
  const params = pickApiErrorParams(json);
  return { ok: false, code: pickApiErrorCode(json), status, ...(params ? { params } : {}) };
}

export function reportClientFailure(code: string, status: number | null = null): ReportClientFailure {
  return { ok: false, code, status };
}

function failureText(
  failure: Pick<ReportClientFailure, "code" | "status" | "params">,
  map: ApiErrorCodeMap,
  fallbackKey: MessageKey,
  t: ApiErrorTranslate
): string {
  return resolveApiErrorText({
    code: failure.code,
    json: failure.params ? { params: failure.params } : undefined,
    status: failure.status,
    map,
    fallbackKey,
    t,
  });
}

export function reportErrorText(
  failure: Pick<ReportClientFailure, "code" | "status" | "params">,
  t: ApiErrorTranslate,
  fallbackKey: MessageKey = "ui_report_failed"
): string {
  return failureText(failure, REPORT_ERROR_KEYS, fallbackKey, t);
}

export function userBlockErrorText(
  failure: Pick<ReportClientFailure, "code" | "status" | "params">,
  t: ApiErrorTranslate,
  fallbackKey: MessageKey = "report_err_block_failed"
): string {
  return failureText(failure, USER_BLOCK_ERROR_KEYS, fallbackKey, t);
}
