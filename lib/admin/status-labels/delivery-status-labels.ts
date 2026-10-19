/**
 * 배달 Admin 상태 라벨 레지스트리 (R1 공통 기준) — 원시 상태값을 운영자 한국어/영어로.
 * 미등록 코드는 「알 수 없는 상태」로 표시하고 원시 값은 기술 정보에서만 보여준다.
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";

export type AdminStatusLabel = { ko: string; en: string; tone: AdminTone };

type Registry = Record<string, AdminStatusLabel>;

const STORE_APPROVAL: Registry = {
  pending: { ko: "심사 대기", en: "Pending", tone: "waiting" },
  under_review: { ko: "심사 중", en: "Under review", tone: "progress" },
  revision_requested: { ko: "보완 요청", en: "Changes requested", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "거절", en: "Rejected", tone: "danger" },
  suspended: { ko: "운영 중지", en: "Suspended", tone: "danger" },
};

const STORE_SALES: Registry = {
  approved: { ko: "판매 중", en: "Selling", tone: "success" },
  pending: { ko: "판매 승인 대기", en: "Sales pending", tone: "waiting" },
  rejected: { ko: "판매 거절", en: "Sales rejected", tone: "danger" },
  suspended: { ko: "판매 중지", en: "Sales suspended", tone: "danger" },
};

const REPORT: Registry = {
  pending: { ko: "접수", en: "Received", tone: "waiting" },
  open: { ko: "접수", en: "Received", tone: "waiting" },
  reviewing: { ko: "검토 중", en: "Reviewing", tone: "progress" },
  actioned: { ko: "조치 완료", en: "Actioned", tone: "success" },
  resolved: { ko: "처리 완료", en: "Resolved", tone: "success" },
  dismissed: { ko: "기각", en: "Dismissed", tone: "neutral" },
};

const REVIEW: Registry = {
  visible: { ko: "노출 중", en: "Visible", tone: "success" },
  active: { ko: "노출 중", en: "Visible", tone: "success" },
  published: { ko: "노출 중", en: "Visible", tone: "success" },
  hidden: { ko: "숨김", en: "Hidden", tone: "warning" },
  deleted: { ko: "삭제됨", en: "Deleted", tone: "neutral" },
};

const PRODUCT: Registry = {
  active: { ko: "판매 중", en: "On sale", tone: "success" },
  sold_out: { ko: "품절", en: "Sold out", tone: "warning" },
  hidden: { ko: "숨김", en: "Hidden", tone: "warning" },
  blocked: { ko: "판매 차단", en: "Blocked", tone: "danger" },
  deleted: { ko: "삭제됨", en: "Deleted", tone: "neutral" },
  draft: { ko: "작성 중", en: "Draft", tone: "neutral" },
};

const PRODUCT_REVIEW: Registry = {
  pending: { ko: "검수 대기", en: "Review pending", tone: "waiting" },
  approved: { ko: "검수 승인", en: "Review approved", tone: "success" },
  rejected: { ko: "검수 반려", en: "Review rejected", tone: "danger" },
  none: { ko: "검수 없음", en: "Not reviewed", tone: "neutral" },
};

const COUPON: Registry = {
  draft: { ko: "작성 중", en: "Draft", tone: "neutral" },
  requested: { ko: "승인 요청", en: "Requested", tone: "waiting" },
  approved: { ko: "승인됨", en: "Approved", tone: "progress" },
  rejected: { ko: "거절", en: "Rejected", tone: "danger" },
  scheduled: { ko: "시작 예정", en: "Scheduled", tone: "progress" },
  active: { ko: "진행 중", en: "Active", tone: "success" },
  paused: { ko: "일시 중지", en: "Paused", tone: "warning" },
  ended: { ko: "종료", en: "Ended", tone: "neutral" },
  revoked: { ko: "회수", en: "Revoked", tone: "danger" },
};

const RIDER_DELIVERY: Registry = {
  waiting_rider: { ko: "라이더 배정 대기", en: "Waiting for rider", tone: "waiting" },
  rider_assigned: { ko: "라이더 배정됨", en: "Rider assigned", tone: "progress" },
  pickup_in_progress: { ko: "픽업 중", en: "Picking up", tone: "progress" },
  delivery_failed: { ko: "배달 실패", en: "Delivery failed", tone: "danger" },
  assigned: { ko: "배정됨", en: "Assigned", tone: "progress" },
  picked_up: { ko: "픽업 완료", en: "Picked up", tone: "progress" },
  delivering: { ko: "배달 중", en: "Delivering", tone: "progress" },
  delivered: { ko: "배달 완료", en: "Delivered", tone: "success" },
  failed: { ko: "배달 실패", en: "Failed", tone: "danger" },
  cancelled: { ko: "취소", en: "Cancelled", tone: "neutral" },
};

/** 매장 주문 상태 (`store_orders.order_status`) — 배달 현장 화면 표시용. */
const STORE_ORDER: Registry = {
  pending: { ko: "주문 접수 대기", en: "Pending", tone: "waiting" },
  accepted: { ko: "주문 수락", en: "Accepted", tone: "progress" },
  preparing: { ko: "조리 중", en: "Preparing", tone: "progress" },
  ready_for_pickup: { ko: "픽업 대기", en: "Ready for pickup", tone: "progress" },
  delivering: { ko: "배달 중", en: "Delivering", tone: "progress" },
  arrived: { ko: "도착", en: "Arrived", tone: "progress" },
  completed: { ko: "완료", en: "Completed", tone: "success" },
  cancel_requested: { ko: "취소 요청", en: "Cancel requested", tone: "warning" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
  refund_requested: { ko: "환불 요청", en: "Refund requested", tone: "warning" },
  refunded: { ko: "환불됨", en: "Refunded", tone: "neutral" },
};

/** 배달 경고 이벤트 상태 (`delivery_operation_alert_events.event_status`). */
const ALERT_EVENT: Registry = {
  open: { ko: "미처리", en: "Open", tone: "danger" },
  acknowledged: { ko: "확인함", en: "Acknowledged", tone: "progress" },
  muted: { ko: "알림 끔", en: "Muted", tone: "neutral" },
  resolved: { ko: "해결됨", en: "Resolved", tone: "success" },
};

/** 배달 경고 심각도 (`severity` / `warning_level`). */
const ALERT_SEVERITY: Registry = {
  info: { ko: "참고", en: "Info", tone: "neutral" },
  warning: { ko: "주의", en: "Warning", tone: "warning" },
  critical: { ko: "긴급", en: "Critical", tone: "danger" },
};

/** 자동 조치 실행 상태 (`delivery_operation_alert_actions.action_status`). */
const AUTO_ACTION: Registry = {
  pending_approval: { ko: "승인 대기", en: "Pending approval", tone: "waiting" },
  success: { ko: "성공", en: "Succeeded", tone: "success" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
  rejected: { ko: "거절됨", en: "Rejected", tone: "neutral" },
  skipped: { ko: "건너뜀", en: "Skipped", tone: "neutral" },
};

/** 라이더 관리자 상태 (`delivery_riders.admin_status`). */
const RIDER_ADMIN: Registry = {
  ok: { ko: "정상", en: "Normal", tone: "success" },
  flagged: { ko: "주의 표시", en: "Flagged", tone: "warning" },
  paused: { ko: "배정 일시 중지", en: "Paused", tone: "warning" },
};

/** 회원 상태 (`profiles.status`) — 매장 허브 「사장님 회원」 요약. */
const MEMBER: Registry = {
  active: { ko: "정상", en: "Active", tone: "success" },
  verified_user: { ko: "정상", en: "Active", tone: "success" },
  sns_pending: { ko: "정상", en: "Active", tone: "success" },
  suspended: { ko: "이용 정지", en: "Suspended", tone: "danger" },
  blocked: { ko: "이용 차단", en: "Blocked", tone: "danger" },
  withdrawn: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
  deleted: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
  deactivated: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
};

/** 매장 문의 상태 (`store_inquiries.status`). */
const INQUIRY: Registry = {
  open: { ko: "미답변", en: "Unanswered", tone: "waiting" },
  answered: { ko: "답변 완료", en: "Answered", tone: "success" },
  closed: { ko: "종료", en: "Closed", tone: "neutral" },
  escalated: { ko: "운영팀 이관", en: "Escalated", tone: "warning" },
};

const REGISTRIES = {
  member: MEMBER,
  inquiry: INQUIRY,
  store_approval: STORE_APPROVAL,
  store_sales: STORE_SALES,
  report: REPORT,
  review: REVIEW,
  product: PRODUCT,
  product_review: PRODUCT_REVIEW,
  coupon: COUPON,
  rider_delivery: RIDER_DELIVERY,
  store_order: STORE_ORDER,
  alert_event: ALERT_EVENT,
  alert_severity: ALERT_SEVERITY,
  auto_action: AUTO_ACTION,
  rider_admin: RIDER_ADMIN,
} as const;

export type AdminStatusDomain = keyof typeof REGISTRIES;

export function adminStatusLabel(
  domain: AdminStatusDomain,
  raw: string | null | undefined,
  ko: boolean
): { label: string; tone: AdminTone; known: boolean } {
  const key = String(raw ?? "").trim().toLowerCase();
  const hit = REGISTRIES[domain][key];
  if (hit) return { label: ko ? hit.ko : hit.en, tone: hit.tone, known: true };
  if (!key) return { label: "—", tone: "neutral", known: false };
  return { label: ko ? "알 수 없는 상태" : "Unknown status", tone: "neutral", known: false };
}
