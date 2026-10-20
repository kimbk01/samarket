/**
 * 플랫폼 팝업 Admin 상태 라벨 (재설계 R5 · 네임스페이스 `platform.popup`) — 원시 상태 코드를 화면 1차 정보로 쓰지 않는다.
 * 화면은 이 파일을 import(부수효과)한 뒤 `<AdminStatusLabel namespace={PLATFORM_POPUP_…_NS} code={…} ko={ko} />`
 * 또는 `adminStatusLabelText(PLATFORM_POPUP_…_NS, code, ko)` 로 그린다. 미등록 코드 = 「알 수 없는 상태」(원문은 기술 정보).
 * 문구는 `lib/platform-popup/popup-product-labels.ts` 와 같다. Client-safe (DB·서버 모듈 import 없음).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 팝업 캠페인 상태 — `PLATFORM_POPUP_CAMPAIGN_STATUSES` (lib/platform-popup/types.ts). */
export const PLATFORM_POPUP_STATUS_NS = "platform.popup";
registerAdminStatusLabels(PLATFORM_POPUP_STATUS_NS, {
  draft: { ko: "작성 중", en: "Draft", tone: "neutral" },
  pending_review: { ko: "검토 대기", en: "Pending review", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  scheduled: { ko: "예약", en: "Scheduled", tone: "info" },
  active: { ko: "노출 중", en: "Live", tone: "success" },
  paused: { ko: "일시중지", en: "Paused", tone: "warning" },
  ended: { ko: "종료", en: "Ended", tone: "neutral" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
});

/** 사장님 팝업 신청 상태 — `PLATFORM_POPUP_OWNER_REQUEST_STATUSES` (lib/platform-popup/owner-request-types.ts). */
export const PLATFORM_POPUP_REQUEST_STATUS_NS = "platform.popup.request";
registerAdminStatusLabels(PLATFORM_POPUP_REQUEST_STATUS_NS, {
  draft: { ko: "작성 중", en: "Draft", tone: "neutral" },
  submitted: { ko: "검토 대기", en: "Pending review", tone: "warning" },
  under_review: { ko: "검토 중", en: "Under review", tone: "info" },
  revision_required: { ko: "수정 요청", en: "Revision required", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
});

/** 사장님 팝업 신청 결제 상태 — `PLATFORM_POPUP_OWNER_PAYMENT_STATUSES`. 결제 상태 ≠ 관리자 승인. */
export const PLATFORM_POPUP_PAYMENT_STATUS_NS = "platform.popup.payment";
registerAdminStatusLabels(PLATFORM_POPUP_PAYMENT_STATUS_NS, {
  unfunded: { ko: "미결제", en: "Unfunded", tone: "neutral" },
  funded: { ko: "Cash 결제됨", en: "Cash paid", tone: "success" },
  refunded: { ko: "환불됨", en: "Refunded", tone: "neutral" },
  failed: { ko: "결제 실패", en: "Payment failed", tone: "danger" },
});

/** 팝업·당겨서 새로고침 광고 캠페인 승인 상태 (`platform_popup_campaigns.approval_status`). */
export const PLATFORM_POPUP_APPROVAL_STATUS_NS = "platform.popup.approval";
registerAdminStatusLabels(PLATFORM_POPUP_APPROVAL_STATUS_NS, {
  not_submitted: { ko: "검토 요청 전", en: "Not submitted", tone: "neutral" },
  pending_review: { ko: "검토 대기", en: "Pending review", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "danger" },
});
