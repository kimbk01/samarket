/**
 * 라이더 화면 오류 코드 → 문구 (언어 재감사 2026-11-27 · 설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §4-1 「새 표: 라이더」).
 * `/api/me/rider/**` 는 `error` 에 코드를 보낸다(`store-order-delivery-service.ts`). 화면은 이 함수로만 그린다 — 코드·서버 글 원문 노출 0.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveApiErrorText, type ApiErrorCodeMap, type ApiErrorTranslate } from "@/lib/i18n/api-error-text";

export const RIDER_API_ERROR_MAP: ApiErrorCodeMap = {
  /** 화면 안 코드(요청 실패 종류) */
  load_failed: "ui_rider_load_failed",
  list_failed: "ui_rider_list_failed",
  status_change_failed: "ui_rider_status_change_failed",
  request_failed: "ui_rider_request_failed",
  upload_failed: "ui_rider_request_failed",
  missing_path: "ui_rider_request_failed",
  /** 서버 코드 */
  unauthorized: "common_login_required",
  rider_delivery_columns_missing_apply_migration: "common_content_unavailable",
  rider_profile_not_found: "ui_rider_no_profile",
  missing_order_id: "store_owner_order_not_found",
  missing_ids: "store_owner_order_not_found",
  order_not_found: "store_owner_order_not_found",
  delivery_not_found: "store_owner_order_not_found",
  rider_not_assigned_to_order: "rider_err_not_assigned",
  accept_only_rider_assigned: "rider_err_not_assigned",
  decline_only_rider_assigned: "rider_err_not_assigned",
  invalid_delivery_status: "rider_err_step_not_allowed",
  invalid_delivery_transition: "rider_err_step_not_allowed",
  customer_arrived_only_delivering: "rider_err_step_not_allowed",
  must_accept_before_depart: "rider_err_step_not_allowed",
  order_status_blocks_dispatch: "rider_err_step_not_allowed",
  order_terminal_blocks_delivery: "rider_err_step_not_allowed",
  rider_cannot_set_delivery_failed: "rider_err_step_not_allowed",
  pod_upload_bad_delivery_status: "rider_err_step_not_allowed",
  failure_report_bad_status: "rider_err_step_not_allowed",
  delivery_status_stale_retry: "rider_err_stale_retry",
  failure_report_already_submitted: "rider_err_failure_already_reported",
  failure_report_reason_required: "rider_err_failure_reason_required",
  rider_offline: "rider_err_not_active",
  rider_paused: "rider_err_not_active",
  rider_suspended: "rider_err_not_active",
  invalid_rider_status: "ui_rider_status_change_failed",
  file_too_large: "business_image_upload_too_large",
};

export function resolveRiderApiErrorText(
  code: string | null | undefined,
  t: ApiErrorTranslate,
  fallbackKey: MessageKey = "ui_rider_request_failed"
): string {
  return resolveApiErrorText({ code: code ?? null, map: RIDER_API_ERROR_MAP, fallbackKey, t });
}
