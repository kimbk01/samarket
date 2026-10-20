/**
 * 재설계 R5 상태 라벨 — 회원 계정 상태(`members.accountStatus`) · 결제 상태(`finance.payment`).
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace={…} code=… ko=… />` 또는
 * `adminStatusLabelText(…)` 로만 그린다. 미등록 값 = 「알 수 없는 상태」(원문은 기술 정보에서만).
 * Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/**
 * 회원 계정 상태 — `profiles.status` · `moderation_status` · 회원 생애주기(ACTIVE/SUSPENDED/BLOCKED/WITHDRAWN/PURGED,
 * `normalizeMemberAdminLifecycle`). 코드는 소문자로 조회된다.
 */
export const MEMBERS_ACCOUNT_STATUS_NS = "members.accountStatus";
registerAdminStatusLabels(MEMBERS_ACCOUNT_STATUS_NS, {
  active: { ko: "정상", en: "Active", tone: "success" },
  normal: { ko: "정상", en: "Active", tone: "success" },
  warned: { ko: "경고", en: "Warned", tone: "warning" },
  warning: { ko: "경고", en: "Warned", tone: "warning" },
  needs_review: { ko: "검토 필요", en: "Needs review", tone: "warning" },
  suspended: { ko: "계정 정지", en: "Suspended", tone: "danger" },
  blocked: { ko: "계정 차단", en: "Banned", tone: "danger" },
  banned: { ko: "계정 차단", en: "Banned", tone: "danger" },
  withdrawn: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
  deleted: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
  deactivated: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
  purged: { ko: "영구 삭제", en: "Purged", tone: "neutral" },
});

/**
 * 결제 상태 — 매장·배달 주문 `payment_status`(pending/paid/funded/failed/cancelled/refunded) ·
 * 광고 신청 결제(pending/checking/confirmed/rejected/cancelled) · 팝업 신청 결제(unfunded/funded/refunded/failed).
 */
export const FINANCE_PAYMENT_STATUS_NS = "finance.payment";
registerAdminStatusLabels(FINANCE_PAYMENT_STATUS_NS, {
  pending: { ko: "결제 대기", en: "Pending", tone: "neutral" },
  unpaid: { ko: "미결제", en: "Unpaid", tone: "neutral" },
  unfunded: { ko: "미결제", en: "Unpaid", tone: "neutral" },
  checking: { ko: "입금 확인 중", en: "Checking", tone: "info" },
  confirmed: { ko: "입금 확인", en: "Confirmed", tone: "success" },
  paid: { ko: "결제 완료", en: "Paid", tone: "success" },
  funded: { ko: "결제 완료", en: "Funded", tone: "success" },
  failed: { ko: "결제 실패", en: "Failed", tone: "danger" },
  rejected: { ko: "결제 반려", en: "Rejected", tone: "neutral" },
  cancelled: { ko: "결제 취소", en: "Cancelled", tone: "neutral" },
  refund_pending: { ko: "환불 대기", en: "Refund pending", tone: "warning" },
  partially_refunded: { ko: "부분 환불", en: "Partially refunded", tone: "warning" },
  refunded: { ko: "환불 완료", en: "Refunded", tone: "neutral" },
});
