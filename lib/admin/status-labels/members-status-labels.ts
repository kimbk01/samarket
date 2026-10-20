/**
 * 회원·고객 워크스페이스 Admin 상태 라벨 (수정 계획 2장 「상태 라벨」).
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace="members.*" code=… ko=… />` 로 그린다.
 * 원시 코드는 화면 1차 정보로 쓰지 않는다. Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 신고 상태 — `reports` / `community_reports` 공통 (`ReportStatus`). */
export const MEMBERS_REPORT_STATUS_NS = "members.report";
registerAdminStatusLabels(MEMBERS_REPORT_STATUS_NS, {
  pending: { ko: "대기", en: "Pending", tone: "neutral" },
  reviewing: { ko: "검토 중", en: "Reviewing", tone: "info" },
  reviewed: { ko: "검토 완료", en: "Reviewed", tone: "success" },
  resolved: { ko: "처리 완료", en: "Resolved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "neutral" },
  sanctioned: { ko: "제재 완료", en: "Sanctioned", tone: "danger" },
});

/** 회원 삭제 요청 — `account_deletion_requests.status`. */
export const MEMBERS_DELETION_REQUEST_NS = "members.deletionRequest";
registerAdminStatusLabels(MEMBERS_DELETION_REQUEST_NS, {
  requested: { ko: "접수", en: "Requested", tone: "neutral" },
  processing: { ko: "처리 중", en: "Processing", tone: "info" },
  completed: { ko: "삭제 완료", en: "Completed", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "neutral" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
});

/** 전화 인증 서비스 상태 — `/api/admin/users/phone-verification/ops` `health`. */
export const MEMBERS_PHONE_OPS_HEALTH_NS = "members.phoneOpsHealth";
registerAdminStatusLabels(MEMBERS_PHONE_OPS_HEALTH_NS, {
  running_ok: { ko: "정상 운영", en: "Running", tone: "success" },
  admin_stopped: { ko: "관리자 중지", en: "Stopped by admin", tone: "neutral" },
  config_error: { ko: "설정 오류", en: "Config error", tone: "danger" },
  low_balance: { ko: "잔액 부족", en: "Low balance", tone: "warning" },
  provider_down: { ko: "공급자 장애", en: "Provider down", tone: "danger" },
  send_limited: { ko: "발송 제한", en: "Send limited", tone: "warning" },
  unverified: { ko: "확인 불가", en: "Unverified", tone: "warning" },
});

/** SMS 발송 결과 — `phone_otp_sms_deliveries.outcome`. */
export const MEMBERS_SMS_OUTCOME_NS = "members.smsOutcome";
registerAdminStatusLabels(MEMBERS_SMS_OUTCOME_NS, {
  success: { ko: "발송 성공", en: "Sent", tone: "success" },
  failed: { ko: "발송 실패", en: "Failed", tone: "danger" },
});

/**
 * API 오류 값 → 오류 맵 코드. snake_case 코드만 그대로 넘기고(오류 맵이 문구로 바꾼다),
 * DB·런타임 원문 메시지(공백·대문자 포함)는 「조치를 완료하지 못했습니다」 계열 코드로 바꿔 원문 노출을 막는다.
 */
export function membersOperatorErrorCode(raw: string | null | undefined, fallback = "action_failed"): string {
  const v = String(raw ?? "").trim();
  return /^[a-z][a-z0-9_]*$/.test(v) ? v : fallback;
}
