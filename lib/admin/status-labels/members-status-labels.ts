/**
 * 회원·고객 워크스페이스 Admin 상태 라벨 (수정 계획 2장 「상태 라벨」).
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace="members.*" code=… ko=… />` 로 그린다.
 * 원시 코드는 화면 1차 정보로 쓰지 않는다. Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 신고 상태 — `reports` / `community_reports` 공통 (`ReportStatus`). */
export const MEMBERS_REPORT_STATUS_NS = "members.report";
registerAdminStatusLabels(MEMBERS_REPORT_STATUS_NS, {
  pending: { ...catalogPair("admin_pending_3"), tone: "neutral" },
  reviewing: { ...catalogPair("admin_chat_reports_status_reviewing"), tone: "info" },
  reviewed: { ...catalogPair("admin_reviewed"), tone: "success" },
  resolved: { ...catalogPair("admin_chat_reports_status_resolved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "neutral" },
  sanctioned: { ...catalogPair("admin_sanctioned"), tone: "danger" },
});

/** 회원 삭제 요청 — `account_deletion_requests.status`. */
export const MEMBERS_DELETION_REQUEST_NS = "members.deletionRequest";
registerAdminStatusLabels(MEMBERS_DELETION_REQUEST_NS, {
  requested: { ...catalogPair("admin_requested_3"), tone: "neutral" },
  processing: { ...catalogPair("admin_processing"), tone: "info" },
  completed: { ...catalogPair("admin_completed_2"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "neutral" },
  cancelled: { ...catalogPair("admin_cancelled_6"), tone: "neutral" },
});

/** 전화 인증 서비스 상태 — `/api/admin/users/phone-verification/ops` `health`. */
export const MEMBERS_PHONE_OPS_HEALTH_NS = "members.phoneOpsHealth";
registerAdminStatusLabels(MEMBERS_PHONE_OPS_HEALTH_NS, {
  running_ok: { ...catalogPair("admin_running"), tone: "success" },
  admin_stopped: { ...catalogPair("admin_stopped_by_admin"), tone: "neutral" },
  config_error: { ...catalogPair("admin_config_error"), tone: "danger" },
  low_balance: { ...catalogPair("admin_low_balance"), tone: "warning" },
  provider_down: { ...catalogPair("admin_provider_down"), tone: "danger" },
  send_limited: { ...catalogPair("admin_send_limited"), tone: "warning" },
  unverified: { ...catalogPair("admin_unverified_2"), tone: "warning" },
});

/** SMS 발송 결과 — `phone_otp_sms_deliveries.outcome`. */
export const MEMBERS_SMS_OUTCOME_NS = "members.smsOutcome";
registerAdminStatusLabels(MEMBERS_SMS_OUTCOME_NS, {
  success: { ...catalogPair("admin_sent_2"), tone: "success" },
  failed: { ...catalogPair("admin_failed_3"), tone: "danger" },
});

/**
 * API 오류 값 → 오류 맵 코드. snake_case 코드만 그대로 넘기고(오류 맵이 문구로 바꾼다),
 * DB·런타임 원문 메시지(공백·대문자 포함)는 「조치를 완료하지 못했습니다」 계열 코드로 바꿔 원문 노출을 막는다.
 */
export function membersOperatorErrorCode(raw: string | null | undefined, fallback = "action_failed"): string {
  const v = String(raw ?? "").trim();
  return /^[a-z][a-z0-9_]*$/.test(v) ? v : fallback;
}
