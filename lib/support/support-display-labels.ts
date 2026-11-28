/**
 * Support display-label SSOT (Phase 3 B2/B3) — i18n keys for category, issue, reference type
 * and error codes. Customer sheet, history list and Admin console all resolve labels here; no
 * screen prints a raw enum (`STORE_ORDER`) or API error code (`load_failed`) to customers.
 * Status/role/priority wording lives in `support-status-label.ts`.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getSupportCategoryDefinition,
  listIssueTypesForCategory,
} from "@/lib/support/support-category-registry";
import type { SupportReferenceType } from "@/lib/support/support-reference-authority";

/** `useI18n().safeT` 와 같은 모양 — 대체 문구는 선택 */
type SafeT = (key: MessageKey, opts?: { fallbackKo?: string; fallbackEn?: string }) => string;

export function supportCategoryLabel(safeT: SafeT, categoryId: string | null | undefined): string {
  const def = getSupportCategoryDefinition(String(categoryId ?? "").trim());
  return safeT((def?.labelKey ?? "support_cat_other") as MessageKey);
}

/** Null when the case has no issue type (historical / contextual-compat opens). */
export function supportIssueLabel(
  safeT: SafeT,
  categoryId: string | null | undefined,
  issueId: string | null | undefined
): string | null {
  const id = String(issueId ?? "").trim();
  if (!id) return null;
  const issue = listIssueTypesForCategory(String(categoryId ?? "").trim()).find((i) => i.id === id);
  return safeT((issue?.labelKey ?? "support_issue_other") as MessageKey);
}

const REFERENCE_LABEL_KEYS: Record<SupportReferenceType, MessageKey> = {
  GIFT_INSTANCE: "support_ref_gift_instance",
  STORE_ORDER: "support_ref_store_order",
  STORE_PRODUCT: "support_ref_store_product",
  AD_CAMPAIGN: "support_ref_ad_campaign",
  DELIVERY_AD_CAMPAIGN: "support_ref_delivery_ad_campaign",
  STORE_SETTLEMENT: "support_ref_store_settlement",
  FEED_AD_REQUEST: "support_ref_feed_ad_request",
  PLATFORM_POPUP_OWNER_REQUEST: "support_ref_platform_popup_owner_request",
  POINT_CHARGE_REQUEST: "support_ref_point_charge_request",
  BUSINESS_CASH_CHARGE_REQUEST: "support_ref_business_cash_charge_request",
  PARTNER_MEMBERSHIP: "support_ref_partner_membership",
  COIN_WITHDRAWAL_REQUEST: "support_ref_coin_withdrawal_request",
  POINT_PROMOTION_ORDER: "support_ref_point_promotion_order",
  COMMUNITY_POST: "support_ref_community_post",
  COMMUNITY_COMMENT: "support_ref_community_comment",
  COMMUNITY_REPORT: "support_ref_community_report",
  COMMUNITY_SANCTION: "support_ref_community_sanction",
  TRADE_POST: "support_ref_trade_post",
  TRADE_CHAT_ROOM: "support_ref_trade_chat_room",
  TRADE_SANCTION: "support_ref_trade_sanction",
};

export function supportReferenceLabel(safeT: SafeT, referenceType: string | null | undefined): string {
  const key = REFERENCE_LABEL_KEYS[String(referenceType ?? "").trim() as SupportReferenceType];
  return safeT(key ?? "support_ref_unknown");
}

/** Customer-facing error copy for support API / network error codes. Never returns the code. */
export function supportErrorLabel(safeT: SafeT, code: string | null | undefined): string {
  switch (String(code ?? "").trim()) {
    case "unauthorized":
    case "http_401":
      return safeT("support_case_auth_required");
    case "forbidden":
    case "not_found":
    case "http_403":
    case "http_404":
      return safeT("support_case_unavailable");
    case "case_closed":
      return safeT("support_error_case_closed");
    case "active_case_exists":
      return safeT("support_error_active_case_exists");
    case "missing_context":
      return safeT("support_enter_missing_context");
    case "network_error":
      return safeT("common_network_error");
    case "case_updated":
      // 2차 재감사 A: 「확인했어요」 사이에 새 답변이 왔다 — 화면을 다시 읽어 보여 준다
      return safeT("support_error_case_updated");
    case "rate_limited":
    case "http_429":
      // 최종 감사 2026-11-28: 서버 요청 수 제한
      return safeT("support_error_rate_limited");
    case "invalid_transition":
      // 최종 감사 2026-11-28: 지금 상태에서 할 수 없는 처리(예: 답변 완료가 아닌 문의를 「확인했어요」)
      return safeT("support_error_invalid_transition");
    // 전체 수정 계약 §7 E-1 (2026-11-29): 고객 API 가 돌려주는 코드는 모두 여기서 문구를 정한다
    case "store_forbidden":
    case "reference_forbidden":
    case "reference_type_not_allowed":
      return safeT("support_case_unavailable");
    case "empty_body":
      return safeT("support_error_empty_body");
    case "invalid_json":
    case "invalid_request_id":
    case "request_id_conflict":
    case "invalid_seen_last_message_at":
    case "invalid_shown_message_ids":
    case "invalid_action":
    case "invalid_case_id":
    case "invalid_status":
    case "invalid_cursor":
    case "disabled_context":
    case "missing_store_id":
    case "member_case_must_not_have_store":
    case "reference_incomplete":
    case "invalid_reference_id":
    case "missing_category":
    case "invalid_category":
    case "missing_issue_type":
    case "invalid_issue_type":
    case "generic_other_forbidden":
    case "guidance_not_found":
    case "guidance_disabled":
    case "guidance_audience_mismatch":
    case "guidance_category_mismatch":
    case "guidance_issue_mismatch":
    case "guidance_revision_mismatch":
    case "invalid_guidance_outcome":
      return safeT("support_error_invalid_request");
    case "supabase_unconfigured":
    case "missing_table":
    case "missing_guidance_table":
    case "guidance_read_failed":
    case "case_fetch_failed":
    case "cases_fetch_failed":
    case "messages_fetch_failed":
    case "message_save_failed":
    case "case_open_failed":
    case "session_failed":
    case "first_message_failed":
    case "read_failed":
    case "close_failed":
    case "transition_failed":
    case "http_500":
    case "http_503":
      return safeT("support_error_server_failed");
    default:
      return safeT("common_error");
  }
}

/**
 * 전체 수정 계약 §7 E-1 — 고객센터 API 오류 코드 → HTTP 상태 (고객·어드민 라우트 공통 · 단일 표).
 * 서버 실패 = 5xx · 경합(상태가 화면과 달라짐·같은 요청 id 충돌) = 409 · 입력 오류 = 400 · 권한 = 403 · 없음 = 404 · 속도 제한 = 429.
 * 표에 없는 코드 = 500(서버 실패로 본다).
 */
const SUPPORT_ERROR_HTTP_STATUS: Record<string, number> = {
  // 400 입력
  invalid_json: 400,
  missing_context: 400,
  invalid_request_id: 400,
  invalid_seen_last_message_at: 400,
  invalid_shown_message_ids: 400,
  invalid_action: 400,
  invalid_case_id: 400,
  invalid_status: 400,
  invalid_cursor: 400,
  invalid_priority: 400,
  invalid_message: 400,
  empty_body: 400,
  reason_required: 400,
  missing_query: 400,
  missing_guidance_content: 400,
  invalid_cta_kind: 400,
  cta_target_must_be_empty: 400,
  missing_cta_target: 400,
  // 최종 감사 D1: 안내문 이동 대상 검증(support-guidance-authority) — 입력 오류
  cta_url_forbidden: 400,
  invalid_internal_route: 400,
  invalid_domain_entity_target: 400,
  disabled_context: 400,
  missing_store_id: 400,
  member_case_must_not_have_store: 400,
  reference_incomplete: 400,
  invalid_reference_id: 400,
  missing_category: 400,
  invalid_category: 400,
  missing_issue_type: 400,
  invalid_issue_type: 400,
  generic_other_forbidden: 400,
  guidance_not_found: 400,
  guidance_disabled: 400,
  guidance_audience_mismatch: 400,
  guidance_category_mismatch: 400,
  guidance_issue_mismatch: 400,
  guidance_revision_mismatch: 400,
  invalid_guidance_outcome: 400,
  assignee_not_active_admin: 400,
  assignee_not_support_admin: 400,
  // 403 권한
  forbidden: 403,
  store_forbidden: 403,
  reference_forbidden: 403,
  reference_type_not_allowed: 403,
  not_own_message: 403,
  // 404
  not_found: 404,
  // 409 경합
  case_closed: 409,
  case_updated: 409,
  status_conflict: 409,
  active_case_exists: 409,
  request_id_conflict: 409,
  invalid_transition: 409,
  not_closed: 409,
  message_deleted: 409,
  guidance_revision_conflict: 409,
  // 429
  rate_limited: 429,
  // 503 설정·표 없음
  supabase_unconfigured: 503,
  missing_table: 503,
  missing_guidance_table: 503,
};

export function supportErrorHttpStatus(code: string | null | undefined): number {
  return SUPPORT_ERROR_HTTP_STATUS[String(code ?? "").trim()] ?? 500;
}

/** 화면이 다시 읽어야 하는 고객 오류 코드 — 문의 상태가 화면과 달라졌다 */
export function supportErrorNeedsReload(code: string | null | undefined): boolean {
  const c = String(code ?? "").trim();
  return c === "case_closed" || c === "case_updated" || c === "invalid_transition";
}

/**
 * 2차 재감사 H — 어드민 고객지원 화면 전용 오류 문구 (고객용 문구표를 쓰지 않는다). 코드는 보이지 않는다.
 */
export function adminSupportErrorLabel(safeT: SafeT, code: string | null | undefined): string {
  switch (String(code ?? "").trim()) {
    case "invalid_transition":
      return safeT("admin_support_error_invalid_transition");
    case "not_closed":
      return safeT("admin_support_error_not_closed");
    case "status_conflict":
      return safeT("admin_support_error_status_conflict");
    case "case_updated": // 최종 감사 L1: 담당 지정 경합 — 다른 관리자가 먼저 바꿈
      return safeT("admin_support_error_case_updated");
    case "reply_unseen_customer_messages": // 재감사 D1-b
      return safeT("admin_support_notice_unseen_customer_messages");
    case "active_case_exists":
      return safeT("admin_support_error_active_case_exists");
    case "case_closed":
      return safeT("admin_support_error_case_closed");
    case "assignee_not_active_admin":
    case "assignee_not_support_admin":
      return safeT("admin_support_error_assignee_not_allowed");
    case "not_own_message":
      return safeT("admin_support_error_not_own_message");
    case "message_deleted":
      return safeT("admin_support_error_message_deleted");
    case "invalid_message":
      return safeT("admin_support_error_message_missing");
    case "empty_body":
      return safeT("admin_support_error_empty_body");
    case "reason_required":
      return safeT("admin_support_error_reason_required");
    case "not_found":
    case "http_404":
      return safeT("admin_support_error_not_found");
    case "network_error":
      return safeT("common_network_error");
    // 전체 수정 계약 §7 E-1: 서버 실패(5xx)·권한·낡은 화면 — 기본 「오류」 대신 할 일을 알려 준다
    case "invalid_seen_last_message_at":
      return safeT("admin_support_error_reload");
    case "request_id_conflict": // 계약 §1: 같은 요청 id 가 다른 글에 쓰임 — 화면은 다음 전송에 새 id
      return safeT("admin_support_error_request_id_conflict");
    case "forbidden":
    case "forbidden_permission":
    case "admin_only":
    case "super_admin_only":
    case "admin_actor_suspended":
      return safeT("admin_support_error_forbidden");
    case "supabase_unconfigured":
    case "service_role_missing":
    case "missing_table":
    case "read_failed":
    case "load_failed":
    case "action_failed":
    case "case_fetch_failed":
    case "cases_fetch_failed":
    case "messages_fetch_failed":
    case "message_fetch_failed":
    case "message_save_failed":
    case "update_failed":
    case "close_failed":
    case "reopen_failed":
    case "assign_failed":
    case "priority_failed":
    case "edit_failed":
    case "delete_failed":
    case "session_failed":
    case "first_message_failed":
    case "replay_read_failed":
    case "transition_failed": // 전체 수정 §2: 상태 전이 DB 함수 실패
      return safeT("admin_support_error_server_failed");
    default:
      return safeT("common_error");
  }
}
