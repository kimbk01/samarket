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
    default:
      return safeT("common_error");
  }
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
    default:
      return safeT("common_error");
  }
}
